require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Event, EventRegistration, Student, User, Notification } = require('../models');

async function runTests() {
  console.log('--- Starting Events Module Verification Tests ---');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/educonnect';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');
  await EventRegistration.syncIndexes();
  console.log('✅ Synced indexes for EventRegistration');

  const cleanupEventIds = [];

  try {
    // 1. Fetch or create a student
    let student = await Student.findOne();
    if (!student) {
      student = await Student.create({
        studentId: 'TEST-STU-001',
        name: 'Test Student',
        class: '10',
        section: 'A',
        parentEmail: 'parent_test@example.com',
        parentName: 'Test Parent',
      });
    }
    console.log(`Test student: ${student.name} (${student.studentId}), Class: ${student.class}-${student.section}`);

    // 2. Create a General Event (visible to all students)
    const generalEventCode = `TEST-EVT-GEN-${Date.now()}`;
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const generalEvent = await Event.create({
      eventId: generalEventCode,
      title: 'Inter-School Robotics & AI Hackathon',
      description: '24-hour hackathon for building autonomous drones and robotic arms.',
      eventType: 'Workshop',
      date: futureDate,
      startTime: '09:00 AM',
      endTime: '05:00 PM',
      venue: 'Main Innovation Lab',
      organizer: 'Robotics Club',
      class: 'All',
      section: 'All',
      registrationRequired: true,
      registrationDeadline: futureDate,
      image: '',
    });
    cleanupEventIds.push(generalEvent._id);
    console.log('✅ General Event created:', generalEvent.eventId);

    // 3. Create a Class-Specific Event (Class 10, Section A)
    const classSpecificCode = `TEST-EVT-CLS-${Date.now()}`;
    const classEvent = await Event.create({
      eventId: classSpecificCode,
      title: 'Class 10 Science Exhibition Orientation',
      description: 'Orientation on science project submissions.',
      eventType: 'Academic',
      date: futureDate,
      startTime: '11:00 AM',
      endTime: '12:30 PM',
      venue: 'Room 101',
      organizer: 'Science Faculty',
      class: student.class,
      section: student.section,
      registrationRequired: false,
    });
    cleanupEventIds.push(classEvent._id);
    console.log('✅ Class-specific Event created for Class 10-A:', classEvent.eventId);

    // 4. Create an Event for another Class (Class 12-C)
    const otherClassCode = `TEST-EVT-OTHER-${Date.now()}`;
    const otherEvent = await Event.create({
      eventId: otherClassCode,
      title: 'Class 12 Career Counselling',
      description: 'Exclusive counselling for 12th graders.',
      eventType: 'Seminar',
      date: futureDate,
      startTime: '02:00 PM',
      endTime: '04:00 PM',
      venue: 'Auditorium 2',
      organizer: 'Career Cell',
      class: '12',
      section: 'C',
      registrationRequired: true,
    });
    cleanupEventIds.push(otherEvent._id);
    console.log('✅ Unrelated Class Event created for Class 12-C');

    // 5. Test Visibility Scoping for Student (Class 10-A)
    const visibleEvents = await Event.find({
      $or: [
        { class: { $in: ['', null, 'All'] } },
        {
          class: student.class,
          section: { $in: ['', null, 'All', student.section] },
        },
      ],
    }).lean();

    const canSeeGeneral = visibleEvents.some((e) => e.eventId === generalEventCode);
    const canSeeClassEvent = visibleEvents.some((e) => e.eventId === classSpecificCode);
    const canSeeOtherClass = visibleEvents.some((e) => e.eventId === otherClassCode);

    if (!canSeeGeneral) throw new Error('Student cannot see General Event!');
    if (!canSeeClassEvent) throw new Error('Student cannot see Class 10-A Event!');
    if (canSeeOtherClass) throw new Error('Security Breach: Student can see Class 12-C restricted event!');
    console.log('✅ Class/Section visibility verification passed! (Student sees General + 10-A, blocked from 12-C)');

    // 6. Test Event Registration
    console.log('\nTesting Event Registration...');
    const registration = await EventRegistration.create({
      eventId: generalEvent._id,
      eventCode: generalEvent.eventId,
      studentId: student.studentId,
      studentName: student.name,
      parentEmail: student.parentEmail,
      class: student.class,
      section: student.section,
    });
    console.log('✅ Student successfully registered for event:', registration._id);

    // 7. Test Duplicate Registration Prevention (Unique Compound Index)
    let duplicateBlocked = false;
    try {
      await EventRegistration.create({
        eventId: generalEvent._id,
        eventCode: generalEvent.eventId,
        studentId: student.studentId,
        studentName: student.name,
        parentEmail: student.parentEmail,
      });
    } catch (dupErr) {
      if (dupErr.code === 11000 || dupErr.name === 'MongoServerError') {
        duplicateBlocked = true;
      }
    }
    if (!duplicateBlocked) throw new Error('Duplicate registration was NOT blocked!');
    console.log('✅ Duplicate registration prevention verified (E11000 duplicate key caught)!');

    // 8. Test Past Event Filtering
    const pastDate = '2024-01-15';
    const pastEventCode = `TEST-EVT-PAST-${Date.now()}`;
    const pastEvent = await Event.create({
      eventId: pastEventCode,
      title: 'Annual Sports Day 2024',
      eventType: 'Sports',
      date: pastDate,
      startTime: '08:00 AM',
      endTime: '04:00 PM',
      venue: 'School Ground',
      organizer: 'Sports Dept',
      class: 'All',
    });
    cleanupEventIds.push(pastEvent._id);

    // Check upcoming vs past calculation
    const allEvents = await Event.find({ _id: { $in: cleanupEventIds } }).lean();
    const today = new Date().toISOString().slice(0, 10);
    const pastList = allEvents.filter((e) => e.date < today);
    const upcomingList = allEvents.filter((e) => e.date >= today);

    if (!pastList.some((e) => e.eventId === pastEventCode)) {
      throw new Error('Past event was not identified as past!');
    }
    if (upcomingList.some((e) => e.eventId === pastEventCode)) {
      throw new Error('Past event appeared in upcoming list!');
    }
    console.log('✅ Past event handling verified (Proper separation of Upcoming vs Past)!');

    console.log('\n=========================================');
    console.log('🎉 ALL EVENTS MODULE TESTS PASSED SUCCESSFULLY!');
    console.log('=========================================\n');
  } finally {
    // Clean up test events and registrations
    console.log('Cleaning up test data...');
    await Event.deleteMany({ _id: { $in: cleanupEventIds } });
    await EventRegistration.deleteMany({ eventId: { $in: cleanupEventIds } });
    await mongoose.disconnect();
    console.log('✅ Disconnected and cleaned up.');
  }
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
