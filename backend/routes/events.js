const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Event, EventRegistration, Student, Notification } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const { sendMailToParent } = require('../middleware/email');

// ── UPLOAD DIRECTORY & STORAGE ─────────────────────────
const eventUploadDir = path.join(__dirname, '../uploads/events');
if (!fs.existsSync(eventUploadDir)) {
  fs.mkdirSync(eventUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, eventUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const cleanBase = path.basename(file.originalname || 'banner', ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 30);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `event-${cleanBase}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Helper: parse date and time string into a Date object
function parseEventDateTime(dateStr, timeStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  if (!timeStr) {
    d.setHours(23, 59, 59, 999);
    return d;
  }

  // Check 12-hour format e.g. "10:30 AM" or 24-hour "14:30"
  const match12 = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const mins = parseInt(match12[2], 10);
    const meridiem = match12[3] ? match12[3].toUpperCase() : null;

    if (meridiem === 'PM' && hours < 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;

    d.setHours(hours, mins, 0, 0);
    return d;
  }

  d.setHours(23, 59, 59, 999);
  return d;
}

// Helper: check if event is in the past
function isEventPast(event) {
  const now = new Date();
  const endDateTime = parseEventDateTime(event.date, event.endTime || event.startTime);
  if (!endDateTime) return false;
  return now.getTime() > endDateTime.getTime();
}

// Helper: check if event is visible to student
function isEventVisibleToStudent(event, student) {
  if (!event.class || event.class.trim() === '' || event.class.toLowerCase() === 'all') {
    return true;
  }
  if (event.class.trim() !== student.class.trim()) {
    return false;
  }
  if (!event.section || event.section.trim() === '' || event.section.toLowerCase() === 'all') {
    return true;
  }
  return event.section.trim() === student.section.trim();
}

// ── GET /api/events ─────────────────────────────────────────
// Returns events based on role, class visibility, and search/filter parameters
router.get('/events', auth, async (req, res) => {
  try {
    const { type, search, timeframe, class: qClass, section: qSection } = req.query;

    if (req.user.role === 'admin') {
      const filter = {};
      if (type && type !== 'All') filter.eventType = type;
      if (qClass && qClass !== 'All') filter.class = qClass;
      if (qSection && qSection !== 'All') filter.section = qSection;

      if (search) {
        filter.$or = [
          { title: new RegExp(search, 'i') },
          { eventType: new RegExp(search, 'i') },
          { venue: new RegExp(search, 'i') },
          { organizer: new RegExp(search, 'i') },
          { eventId: new RegExp(search, 'i') },
        ];
      }

      const events = await Event.find(filter).sort({ date: 1, startTime: 1 }).lean();

      // Enrich with registration count and past status
      const enriched = await Promise.all(
        events.map(async (e) => {
          const registrationCount = await EventRegistration.countDocuments({ eventId: e._id });
          const isPast = isEventPast(e);
          return {
            ...e,
            registrationCount,
            isPast,
          };
        })
      );

      // Filter by timeframe if specified
      let result = enriched;
      if (timeframe === 'upcoming') {
        result = enriched.filter((e) => !e.isPast);
      } else if (timeframe === 'past') {
        result = enriched.filter((e) => e.isPast);
      }

      return res.json({ events: result });
    }

    // Role: Parent / Student
    const student = await Student.findOne({ studentId: req.user.studentId }).lean();
    if (!student) {
      return res.status(404).json({ error: 'Student record not found for this account.' });
    }

    // Filter by class/section visibility
    const filter = {
      $or: [
        { class: { $in: ['', null, 'All'] } },
        {
          class: student.class,
          section: { $in: ['', null, 'All', student.section] },
        },
      ],
    };

    if (type && type !== 'All') filter.eventType = type;
    if (search) {
      const searchOr = [
        { title: new RegExp(search, 'i') },
        { eventType: new RegExp(search, 'i') },
        { venue: new RegExp(search, 'i') },
        { organizer: new RegExp(search, 'i') },
      ];
      filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
      delete filter.$or;
    }

    const events = await Event.find(filter).sort({ date: 1, startTime: 1 }).lean();

    // Fetch this student's registrations
    const studentRegistrations = await EventRegistration.find({ studentId: student.studentId }).lean();
    const regSet = new Set(studentRegistrations.map((r) => String(r.eventId)));

    const enriched = await Promise.all(
      events.map(async (e) => {
        const isRegistered = regSet.has(String(e._id));
        const registrationCount = await EventRegistration.countDocuments({ eventId: e._id });
        const isPast = isEventPast(e);

        // Check if registration deadline has passed
        let deadlinePassed = false;
        if (e.registrationRequired && e.registrationDeadline) {
          const deadline = new Date(e.registrationDeadline);
          if (!isNaN(deadline.getTime())) {
            deadline.setHours(23, 59, 59, 999);
            deadlinePassed = new Date().getTime() > deadline.getTime();
          }
        }

        return {
          ...e,
          isRegistered,
          registrationCount,
          isPast,
          deadlinePassed,
        };
      })
    );

    let filtered = enriched;
    if (timeframe === 'upcoming') {
      filtered = enriched.filter((e) => !e.isPast);
    } else if (timeframe === 'past') {
      filtered = enriched.filter((e) => e.isPast);
    }

    // Compute dynamic summary metrics
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysLaterTime = sevenDaysLater.getTime();
    const nowTime = new Date().getTime();

    const upcomingEvents = enriched.filter((e) => !e.isPast);
    const totalUpcoming = upcomingEvents.length;
    const todayCount = upcomingEvents.filter((e) => e.date === todayStr).length;
    const tomorrowCount = upcomingEvents.filter((e) => e.date === tomorrowStr).length;
    const thisWeekCount = upcomingEvents.filter((e) => {
      const eDate = new Date(e.date).getTime();
      return eDate >= nowTime - 24 * 60 * 60 * 1000 && eDate <= sevenDaysLaterTime;
    }).length;

    res.json({
      events: filtered,
      summary: {
        totalUpcoming,
        todayCount,
        tomorrowCount,
        thisWeekCount,
        pastCount: enriched.filter((e) => e.isPast).length,
      },
      student: {
        studentId: student.studentId,
        name: student.name,
        class: student.class,
        section: student.section,
      },
    });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: 'Failed to fetch events: ' + err.message });
  }
});

// ── GET /api/events/upcoming ────────────────────────────────
// Returns nearest 3-5 upcoming events for student dashboard
router.get('/events/upcoming', auth, async (req, res) => {
  try {
    let student = null;
    let filter = {};

    if (req.user.role === 'admin') {
      filter = {};
    } else {
      student = await Student.findOne({ studentId: req.user.studentId }).lean();
      if (!student) {
        return res.status(404).json({ error: 'Student record not found.' });
      }
      filter = {
        $or: [
          { class: { $in: ['', null, 'All'] } },
          {
            class: student.class,
            section: { $in: ['', null, 'All', student.section] },
          },
        ],
      };
    }

    const events = await Event.find(filter).sort({ date: 1, startTime: 1 }).lean();

    // Student's registered events
    let regSet = new Set();
    if (student) {
      const regs = await EventRegistration.find({ studentId: student.studentId }).lean();
      regSet = new Set(regs.map((r) => String(r.eventId)));
    }

    // Filter out past events
    const upcoming = events
      .filter((e) => !isEventPast(e))
      .map((e) => ({
        ...e,
        isRegistered: regSet.has(String(e._id)),
      }));

    // Dynamic counts
    const todayStr = new Date().toISOString().slice(0, 10);
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowStr = tomorrowDate.toISOString().slice(0, 10);

    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const sevenDaysLaterTime = sevenDaysLater.getTime();
    const nowTime = new Date().getTime();

    const todayCount = upcoming.filter((e) => e.date === todayStr).length;
    const tomorrowCount = upcoming.filter((e) => e.date === tomorrowStr).length;
    const thisWeekCount = upcoming.filter((e) => {
      const eDate = new Date(e.date).getTime();
      return eDate >= nowTime - 24 * 60 * 60 * 1000 && eDate <= sevenDaysLaterTime;
    }).length;

    res.json({
      upcoming: upcoming.slice(0, 5),
      totalUpcoming: upcoming.length,
      todayCount,
      tomorrowCount,
      thisWeekCount,
    });
  } catch (err) {
    console.error('Error fetching upcoming events:', err);
    res.status(500).json({ error: 'Failed to fetch upcoming events: ' + err.message });
  }
});

// ── GET /api/events/:id ─────────────────────────────────────
router.get('/events/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { eventId: id }] } : { eventId: id };

    const event = await Event.findOne(query).lean();
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    if (req.user.role === 'admin') {
      const registrations = await EventRegistration.find({ eventId: event._id }).sort({ registeredAt: -1 }).lean();
      return res.json({
        event: {
          ...event,
          isPast: isEventPast(event),
        },
        registrations,
        registrationCount: registrations.length,
      });
    }

    // Role: Student / Parent — verify class/section visibility
    const student = await Student.findOne({ studentId: req.user.studentId }).lean();
    if (!student || !isEventVisibleToStudent(event, student)) {
      return res.status(403).json({ error: 'You do not have permission to view this event.' });
    }

    const reg = await EventRegistration.findOne({ eventId: event._id, studentId: student.studentId }).lean();
    const registrationCount = await EventRegistration.countDocuments({ eventId: event._id });
    const isPast = isEventPast(event);

    let deadlinePassed = false;
    if (event.registrationRequired && event.registrationDeadline) {
      const deadline = new Date(event.registrationDeadline);
      if (!isNaN(deadline.getTime())) {
        deadline.setHours(23, 59, 59, 999);
        deadlinePassed = new Date().getTime() > deadline.getTime();
      }
    }

    res.json({
      event: {
        ...event,
        isRegistered: !!reg,
        registration: reg || null,
        registrationCount,
        isPast,
        deadlinePassed,
      },
    });
  } catch (err) {
    console.error('Error fetching event details:', err);
    res.status(500).json({ error: 'Failed to retrieve event: ' + err.message });
  }
});

// ── POST /api/events ────────────────────────────────────────
// Admin creates event
router.post('/events', auth, adminOnly, upload.single('banner'), async (req, res) => {
  try {
    const {
      title,
      description,
      eventType,
      date,
      startTime,
      endTime,
      venue,
      organizer,
      class: className,
      section,
      registrationRequired,
      registrationDeadline,
    } = req.body;

    if (!title || !eventType || !date || !startTime || !venue || !organizer) {
      return res.status(400).json({
        error: 'Title, Event Type, Date, Start Time, Venue, and Organizer are required.',
      });
    }

    const eventId = `EVT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

    let image = '';
    if (req.file) {
      image = `/uploads/events/${req.file.filename}`;
    }

    const event = await Event.create({
      eventId,
      title: title.trim(),
      description: (description || '').trim(),
      eventType: eventType.trim(),
      date: date.trim(),
      startTime: startTime.trim(),
      endTime: (endTime || '').trim(),
      venue: venue.trim(),
      organizer: organizer.trim(),
      class: (className || '').trim(),
      section: (section || '').trim(),
      registrationRequired: registrationRequired === true || registrationRequired === 'true',
      registrationDeadline: (registrationDeadline || '').trim(),
      image,
      createdBy: req.user.name || req.user.email || 'Admin',
    });

    // Notify relevant students/parents
    try {
      let studentFilter = {};
      if (event.class && event.class !== 'All') {
        studentFilter.class = event.class;
        if (event.section && event.section !== 'All') {
          studentFilter.section = event.section;
        }
      }

      const relevantStudents = await Student.find(studentFilter).lean();
      const notifs = relevantStudents
        .filter((s) => s.parentEmail)
        .map((s) => ({
          targetEmail: s.parentEmail,
          type: 'info',
          title: `🎉 New Event: ${event.title}`,
          message: `New ${event.eventType} event "${event.title}" announced for ${event.date} at ${event.venue}. Organized by ${event.organizer}.`,
          isRead: false,
        }));

      if (notifs.length > 0) {
        await Notification.insertMany(notifs);
      }
    } catch (notifErr) {
      console.warn('Event notification dispatch warning:', notifErr.message);
    }

    res.status(201).json({ message: 'Event created successfully.', event });
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: 'Failed to create event: ' + err.message });
  }
});

// ── PUT /api/events/:id ─────────────────────────────────────
// Admin updates event
router.put('/events/:id', auth, adminOnly, upload.single('banner'), async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { eventId: id }] } : { eventId: id };

    const event = await Event.findOne(query);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const {
      title,
      description,
      eventType,
      date,
      startTime,
      endTime,
      venue,
      organizer,
      class: className,
      section,
      registrationRequired,
      registrationDeadline,
    } = req.body;

    if (title) event.title = title.trim();
    if (description !== undefined) event.description = description.trim();
    if (eventType) event.eventType = eventType.trim();
    if (date) event.date = date.trim();
    if (startTime) event.startTime = startTime.trim();
    if (endTime !== undefined) event.endTime = endTime.trim();
    if (venue) event.venue = venue.trim();
    if (organizer) event.organizer = organizer.trim();
    if (className !== undefined) event.class = className.trim();
    if (section !== undefined) event.section = section.trim();
    if (registrationRequired !== undefined) {
      event.registrationRequired = registrationRequired === true || registrationRequired === 'true';
    }
    if (registrationDeadline !== undefined) {
      event.registrationDeadline = registrationDeadline.trim();
    }

    if (req.file) {
      event.image = `/uploads/events/${req.file.filename}`;
    }

    await event.save();
    res.json({ message: 'Event updated successfully.', event });
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: 'Failed to update event: ' + err.message });
  }
});

// ── DELETE /api/events/:id ──────────────────────────────────
// Admin deletes event
router.delete('/events/:id', auth, adminOnly, async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { eventId: id }] } : { eventId: id };

    const event = await Event.findOneAndDelete(query);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    // Delete all registrations for this event
    await EventRegistration.deleteMany({ eventId: event._id });

    res.json({ message: 'Event and all related registrations deleted.' });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: 'Failed to delete event: ' + err.message });
  }
});

// ── POST /api/events/:id/register ───────────────────────────
// Student/Parent registers for an event
router.post('/events/:id/register', auth, async (req, res) => {
  try {
    if (req.user.role === 'admin') {
      return res.status(400).json({ error: 'Admin accounts cannot register as students for events.' });
    }

    const student = await Student.findOne({ studentId: req.user.studentId }).lean();
    if (!student) {
      return res.status(404).json({ error: 'Student record not found for this user.' });
    }

    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { eventId: id }] } : { eventId: id };

    const event = await Event.findOne(query);
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    // Check visibility / eligibility
    if (!isEventVisibleToStudent(event, student)) {
      return res.status(403).json({ error: 'This event is restricted to other classes or sections.' });
    }

    // Check registrationRequired
    if (!event.registrationRequired) {
      return res.status(400).json({ error: 'This event does not require registration. All eligible students are welcome!' });
    }

    // Check if event already in the past
    if (isEventPast(event)) {
      return res.status(400).json({ error: 'Cannot register for an event that has already concluded.' });
    }

    // Check registration deadline
    if (event.registrationDeadline) {
      const deadline = new Date(event.registrationDeadline);
      if (!isNaN(deadline.getTime())) {
        deadline.setHours(23, 59, 59, 999);
        if (new Date().getTime() > deadline.getTime()) {
          return res.status(400).json({ error: `Registration closed on ${event.registrationDeadline}.` });
        }
      }
    }

    // Check duplicate registration
    const existing = await EventRegistration.findOne({
      eventId: event._id,
      studentId: student.studentId,
    });
    if (existing) {
      return res.status(400).json({ error: 'You are already registered for this event.' });
    }

    // Create registration record
    const registration = await EventRegistration.create({
      eventId: event._id,
      eventCode: event.eventId,
      studentId: student.studentId,
      studentName: student.name,
      parentEmail: student.parentEmail || req.user.email,
      class: student.class,
      section: student.section,
      registeredAt: new Date(),
    });

    // In-app notification
    try {
      const notifEmail = student.parentEmail || req.user.email;
      await Notification.create({
        targetEmail: notifEmail,
        type: 'success',
        title: `✅ Registered: ${event.title}`,
        message: `Successfully registered ${student.name} for "${event.title}" scheduled for ${event.date} at ${event.venue}.`,
        isRead: false,
      });

      // Email confirmation if parent email exists
      if (notifEmail) {
        const emailHtml = `
          <div style="font-family:sans-serif;padding:24px;background:#001f54;color:#ffffff;border-radius:12px;">
            <h2 style="color:#f59e0b;margin-bottom:8px;">Event Registration Confirmed!</h2>
            <p style="font-size:15px;line-height:1.6;">Hello ${student.parentName || 'Parent'},</p>
            <p style="font-size:15px;line-height:1.6;">Your registration for <strong>${student.name}</strong> has been successfully confirmed.</p>
            <div style="background:rgba(255,255,255,0.1);padding:16px;border-radius:8px;margin:16px 0;">
              <p style="margin:4px 0;"><strong>Event:</strong> ${event.title}</p>
              <p style="margin:4px 0;"><strong>Category:</strong> ${event.eventType}</p>
              <p style="margin:4px 0;"><strong>Date:</strong> ${event.date}</p>
              <p style="margin:4px 0;"><strong>Time:</strong> ${event.startTime}${event.endTime ? ' – ' + event.endTime : ''}</p>
              <p style="margin:4px 0;"><strong>Venue:</strong> ${event.venue}</p>
              <p style="margin:4px 0;"><strong>Organizer:</strong> ${event.organizer}</p>
            </div>
            <p style="font-size:13px;color:rgba(255,255,255,0.8);">Thank you for participating with EduConnect.</p>
          </div>`;
        await sendMailToParent(notifEmail, student.parentPhone, `Registration Confirmed: ${event.title}`, emailHtml);
      }
    } catch (notifErr) {
      console.warn('Registration notification warning:', notifErr.message);
    }

    res.status(201).json({
      message: `Successfully registered for ${event.title}!`,
      registration,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'You are already registered for this event.' });
    }
    console.error('Error registering for event:', err);
    res.status(500).json({ error: 'Failed to complete registration: ' + err.message });
  }
});

// ── GET /api/events/:id/registrations ───────────────────────
// Admin views registrations for an event
router.get('/events/:id/registrations', auth, adminOnly, async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { eventId: id }] } : { eventId: id };

    const event = await Event.findOne(query).lean();
    if (!event) return res.status(404).json({ error: 'Event not found.' });

    const registrations = await EventRegistration.find({ eventId: event._id })
      .sort({ registeredAt: -1 })
      .lean();

    res.json({
      eventTitle: event.title,
      eventId: event.eventId,
      totalRegistrations: registrations.length,
      registrations,
    });
  } catch (err) {
    console.error('Error fetching event registrations:', err);
    res.status(500).json({ error: 'Failed to load registrations: ' + err.message });
  }
});

module.exports = router;
