const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const { Assignment, AssignmentSubmission, Student, Notification } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');

// ── UPLOAD DIRECTORIES & STORAGE ─────────────────────────
const attachmentDir = path.join(__dirname, '../uploads/assignments/attachments');
const submissionDir = path.join(__dirname, '../uploads/assignments/submissions');

if (!fs.existsSync(attachmentDir)) fs.mkdirSync(attachmentDir, { recursive: true });
if (!fs.existsSync(submissionDir)) fs.mkdirSync(submissionDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'submissionFile') {
      cb(null, submissionDir);
    } else {
      cb(null, attachmentDir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const cleanBase = path.basename(file.originalname || 'file', ext).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${cleanBase}-${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB
});

// Helper to determine dynamic status
function calculateStatus(dueDate, hasSubmission) {
  if (hasSubmission) return 'Submitted';
  if (!dueDate) return 'Pending';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(dueDate);
  // Parse date string e.g. YYYY-MM-DD
  if (isNaN(due.getTime())) {
    return 'Pending';
  }
  due.setHours(23, 59, 59, 999);

  return today.getTime() > due.getTime() ? 'Overdue' : 'Pending';
}

// ── GET /api/assignments ──────────────────────────────────
// Returns assignments based on role.
// Admin: returns all assignments with submission stats.
// Student/Parent: returns only assignments for their student's class & section with dynamic status.
router.get('/assignments', auth, async (req, res) => {
  try {
    const { status, subject, search, class: qClass, section: qSection } = req.query;

    if (req.user.role === 'admin') {
      const filter = {};
      if (qClass) filter.class = qClass;
      if (qSection) filter.section = qSection;
      if (subject && subject !== 'All') filter.subject = subject;
      if (search) {
        filter.$or = [
          { title: new RegExp(search, 'i') },
          { subject: new RegExp(search, 'i') },
          { assignmentId: new RegExp(search, 'i') },
        ];
      }

      const assignments = await Assignment.find(filter).sort({ createdAt: -1 }).lean();

      // Enrich with submission counts
      const enriched = await Promise.all(assignments.map(async (a) => {
        const [submissionCount, totalStudents] = await Promise.all([
          AssignmentSubmission.countDocuments({ assignmentId: a._id }),
          Student.countDocuments({ class: a.class, section: a.section })
        ]);
        return {
          ...a,
          submissionCount,
          totalStudents,
        };
      }));

      return res.json({ assignments: enriched });
    }

    // Role: parent / student
    const student = await Student.findOne({ studentId: req.user.studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student record not found for this account.' });
    }

    const filter = {
      class: student.class,
      section: student.section,
      status: { $ne: 'Archived' }
    };

    if (subject && subject !== 'All') filter.subject = subject;
    if (search) {
      filter.$or = [
        { title: new RegExp(search, 'i') },
        { subject: new RegExp(search, 'i') }
      ];
    }

    const assignments = await Assignment.find(filter).sort({ dueDate: 1, createdAt: -1 }).lean();

    // Fetch all submissions for this student
    const submissions = await AssignmentSubmission.find({ studentId: student.studentId }).lean();
    const subMap = new Map();
    submissions.forEach(sub => {
      subMap.set(String(sub.assignmentId), sub);
    });

    let total = 0;
    let pending = 0;
    let submitted = 0;
    let overdue = 0;

    const mapped = assignments.map(a => {
      total++;
      const sub = subMap.get(String(a._id));
      const dynamicStatus = calculateStatus(a.dueDate, !!sub);

      if (dynamicStatus === 'Submitted') submitted++;
      else if (dynamicStatus === 'Overdue') overdue++;
      else pending++;

      return {
        ...a,
        status: dynamicStatus,
        submission: sub || null,
        isSubmitted: !!sub,
        submittedAt: sub ? sub.submittedAt : null,
      };
    });

    // Apply status filter if requested
    const filtered = status && status !== 'All'
      ? mapped.filter(a => a.status.toLowerCase() === status.toLowerCase())
      : mapped;

    res.json({
      assignments: filtered,
      summary: { total, pending, submitted, overdue },
      student: {
        studentId: student.studentId,
        name: student.name,
        class: student.class,
        section: student.section
      }
    });

  } catch (err) {
    console.error('Error fetching assignments:', err);
    res.status(500).json({ error: 'Failed to fetch assignments.' });
  }
});

// ── GET /api/assignments/upcoming ─────────────────────────
// Returns nearest upcoming deadlines for student dashboard
router.get('/assignments/upcoming', auth, async (req, res) => {
  try {
    const student = await Student.findOne({ studentId: req.user.studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    const assignments = await Assignment.find({
      class: student.class,
      section: student.section,
      status: 'Active'
    }).sort({ dueDate: 1 }).lean();

    const submissions = await AssignmentSubmission.find({ studentId: student.studentId }).lean();
    const subSet = new Set(submissions.map(s => String(s.assignmentId)));

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const upcoming = assignments.map(a => {
      const isSub = subSet.has(String(a._id));
      const dynamicStatus = calculateStatus(a.dueDate, isSub);
      return {
        ...a,
        status: dynamicStatus,
        isSubmitted: isSub,
      };
    })
    // Prioritize non-submitted first, then by nearest due date
    .sort((a, b) => {
      if (a.isSubmitted !== b.isSubmitted) return a.isSubmitted ? 1 : -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    })
    .slice(0, 6);

    res.json({ upcoming });
  } catch (err) {
    console.error('Error fetching upcoming assignments:', err);
    res.status(500).json({ error: 'Failed to fetch upcoming assignments.' });
  }
});

// ── GET /api/assignments/:id ──────────────────────────────
router.get('/assignments/:id', auth, async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { assignmentId: id }] } : { assignmentId: id };

    const assignment = await Assignment.findOne(query).lean();
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

    if (req.user.role === 'admin') {
      const submissions = await AssignmentSubmission.find({ assignmentId: assignment._id }).sort({ submittedAt: -1 }).lean();
      const allClassStudents = await Student.find({ class: assignment.class, section: assignment.section }).select('studentId name rollNumber').lean();

      return res.json({
        assignment,
        submissions,
        totalStudents: allClassStudents.length,
        students: allClassStudents,
      });
    }

    // Role: student / parent
    const student = await Student.findOne({ studentId: req.user.studentId });
    if (!student || student.class !== assignment.class || student.section !== assignment.section) {
      return res.status(403).json({ error: 'Access denied to this assignment.' });
    }

    const submission = await AssignmentSubmission.findOne({ assignmentId: assignment._id, studentId: student.studentId }).lean();
    const dynamicStatus = calculateStatus(assignment.dueDate, !!submission);

    res.json({
      assignment: {
        ...assignment,
        status: dynamicStatus,
        submission: submission || null,
        isSubmitted: !!submission,
      }
    });

  } catch (err) {
    console.error('Error retrieving assignment:', err);
    res.status(500).json({ error: 'Failed to retrieve assignment.' });
  }
});

// ── POST /api/assignments ─────────────────────────────────
// Admin creates assignment
router.post('/assignments', auth, adminOnly, upload.single('attachment'), async (req, res) => {
  try {
    const {
      title,
      subject,
      description,
      class: className,
      section,
      assignedDate,
      dueDate,
      priority,
    } = req.body;

    if (!title || !subject || !className || !section || !dueDate) {
      return res.status(400).json({ error: 'Title, Subject, Class, Section, and Due Date are required.' });
    }

    // Generate unique assignment ID
    const assignmentId = `ASN-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;

    let attachment = '';
    let attachmentName = '';
    let attachmentType = '';

    if (req.file) {
      attachment = `/uploads/assignments/attachments/${req.file.filename}`;
      attachmentName = req.file.originalname;
      attachmentType = req.file.mimetype;
    }

    const assignment = await Assignment.create({
      assignmentId,
      title: title.trim(),
      subject: subject.trim(),
      description: (description || '').trim(),
      assignedBy: req.user.name || req.user.email || 'Teacher',
      class: className.trim(),
      section: section.trim(),
      assignedDate: assignedDate || new Date().toISOString().slice(0, 10),
      dueDate,
      priority: priority || 'Medium',
      attachment,
      attachmentName,
      attachmentType,
      status: 'Active',
    });

    // Notify students/parents in this class & section
    try {
      const studentsInClass = await Student.find({ class: className.trim(), section: section.trim() }).lean();
      const notifs = studentsInClass
        .filter(s => s.parentEmail)
        .map(s => ({
          targetEmail: s.parentEmail,
          type: 'info',
          title: `New Assignment: ${assignment.title}`,
          message: `A new ${assignment.subject} assignment "${assignment.title}" has been assigned for Class ${assignment.class}-${assignment.section}. Due on ${assignment.dueDate}.`,
          isRead: false
        }));

      if (notifs.length > 0) {
        await Notification.insertMany(notifs);
      }
    } catch (notifErr) {
      console.warn('Assignment notification creation warning:', notifErr.message);
    }

    res.status(201).json({ message: 'Assignment created successfully.', assignment });
  } catch (err) {
    console.error('Error creating assignment:', err);
    res.status(500).json({ error: 'Failed to create assignment: ' + err.message });
  }
});

// ── PUT /api/assignments/:id ──────────────────────────────
// Admin updates assignment
router.put('/assignments/:id', auth, adminOnly, upload.single('attachment'), async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { assignmentId: id }] } : { assignmentId: id };

    const assignment = await Assignment.findOne(query);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

    const {
      title,
      subject,
      description,
      class: className,
      section,
      assignedDate,
      dueDate,
      priority,
      status,
    } = req.body;

    if (title) assignment.title = title.trim();
    if (subject) assignment.subject = subject.trim();
    if (description !== undefined) assignment.description = description.trim();
    if (className) assignment.class = className.trim();
    if (section) assignment.section = section.trim();
    if (assignedDate) assignment.assignedDate = assignedDate;
    if (dueDate) assignment.dueDate = dueDate;
    if (priority) assignment.priority = priority;
    if (status) assignment.status = status;

    if (req.file) {
      assignment.attachment = `/uploads/assignments/attachments/${req.file.filename}`;
      assignment.attachmentName = req.file.originalname;
      assignment.attachmentType = req.file.mimetype;
    }

    await assignment.save();
    res.json({ message: 'Assignment updated successfully.', assignment });
  } catch (err) {
    console.error('Error updating assignment:', err);
    res.status(500).json({ error: 'Failed to update assignment: ' + err.message });
  }
});

// ── DELETE /api/assignments/:id ───────────────────────────
// Admin deletes assignment
router.delete('/assignments/:id', auth, adminOnly, async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { assignmentId: id }] } : { assignmentId: id };

    const assignment = await Assignment.findOneAndDelete(query);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

    // Also delete submissions
    await AssignmentSubmission.deleteMany({ assignmentId: assignment._id });

    res.json({ message: 'Assignment and related submissions deleted.' });
  } catch (err) {
    console.error('Error deleting assignment:', err);
    res.status(500).json({ error: 'Failed to delete assignment.' });
  }
});

// ── POST /api/assignments/:id/submit ──────────────────────
// Student submits work
router.post('/assignments/:id/submit', auth, upload.single('submissionFile'), async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { assignmentId: id }] } : { assignmentId: id };

    const assignment = await Assignment.findOne(query);
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

    // Identify student
    const student = await Student.findOne({ studentId: req.user.studentId });
    if (!student) {
      return res.status(404).json({ error: 'Student record not found.' });
    }

    if (student.class !== assignment.class || student.section !== assignment.section) {
      return res.status(403).json({ error: 'You are not enrolled in the class/section for this assignment.' });
    }

    let submissionFile = '';
    let submissionFileName = '';
    let submissionFileType = '';

    if (req.file) {
      submissionFile = `/uploads/assignments/submissions/${req.file.filename}`;
      submissionFileName = req.file.originalname;
      submissionFileType = req.file.mimetype;
    }

    // Determine status (Late if submitted past due date)
    const todayStr = new Date().toISOString().slice(0, 10);
    const isLate = assignment.dueDate && todayStr > assignment.dueDate;
    const subStatus = isLate ? 'Late' : 'Submitted';

    const submission = await AssignmentSubmission.findOneAndUpdate(
      { assignmentId: assignment._id, studentId: student.studentId },
      {
        assignmentId: assignment._id,
        assignmentCode: assignment.assignmentId,
        studentId: student.studentId,
        studentName: student.name,
        class: student.class,
        section: student.section,
        submissionFile: submissionFile || undefined,
        submissionFileName: submissionFileName || undefined,
        submissionFileType: submissionFileType || undefined,
        submittedAt: new Date(),
        status: subStatus,
        remarks: req.body.remarks || '',
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    res.json({
      message: 'Assignment submitted successfully!',
      submission,
      status: 'Submitted'
    });
  } catch (err) {
    console.error('Error submitting assignment:', err);
    res.status(500).json({ error: 'Failed to submit assignment: ' + err.message });
  }
});

// ── GET /api/assignments/:id/submissions ──────────────────
// Admin views all submissions for an assignment
router.get('/assignments/:id/submissions', auth, adminOnly, async (req, res) => {
  try {
    const id = req.params.id;
    const isObjectId = mongoose.Types.ObjectId.isValid(id);
    const query = isObjectId ? { $or: [{ _id: id }, { assignmentId: id }] } : { assignmentId: id };

    const assignment = await Assignment.findOne(query).lean();
    if (!assignment) return res.status(404).json({ error: 'Assignment not found.' });

    const [submissions, classStudents] = await Promise.all([
      AssignmentSubmission.find({ assignmentId: assignment._id }).sort({ submittedAt: -1 }).lean(),
      Student.find({ class: assignment.class, section: assignment.section }).lean()
    ]);

    const submittedMap = new Map();
    submissions.forEach(s => submittedMap.set(s.studentId, s));

    const studentList = classStudents.map(s => {
      const sub = submittedMap.get(s.studentId);
      return {
        studentId: s.studentId,
        studentName: s.name,
        rollNumber: s.rollNumber || '—',
        hasSubmitted: !!sub,
        status: sub ? sub.status : calculateStatus(assignment.dueDate, false),
        submittedAt: sub ? sub.submittedAt : null,
        submissionFile: sub ? sub.submissionFile : null,
        submissionFileName: sub ? sub.submissionFileName : null,
        remarks: sub ? sub.remarks : '',
      };
    });

    res.json({
      assignment,
      submissions: studentList,
      totalStudents: classStudents.length,
      totalSubmitted: submissions.length,
    });
  } catch (err) {
    console.error('Error getting assignment submissions:', err);
    res.status(500).json({ error: 'Failed to get submissions.' });
  }
});

module.exports = router;
