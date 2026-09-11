require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const http = require('http');
const express = require('express');
const { Student, Attendance, User } = require('../models');

async function runE2ETests() {
  console.log('=== Attendance API Endpoint (E2E HTTP) Test ===\n');

  const mongoUri = process.env.MONGO_URI;
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  // Find admin user for JWT token
  const adminUser = await User.findOne({ role: 'admin' });
  assert.ok(adminUser, 'Admin user must exist in database');
  const token = jwt.sign(
    { id: adminUser._id, email: adminUser.email, role: 'admin', name: adminUser.name },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Setup express test app with routes
  const app = express();
  app.use(express.json());
  app.use('/api', require('../routes/api'));

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`✅ Test server running on port ${port}`);

  const testDate = '2026-09-12';
  const testClass = '10';
  const testSection = 'A';
  const testPeriod = 2;
  const testSubject = 'E2E Social Studies';

  try {
    // Clean up any test records
    await Attendance.deleteMany({ class: testClass, section: testSection, date: testDate, period: testPeriod, subject: testSubject });

    // Step 1: Query class 10 A students
    const students = await Student.find({ class: testClass, section: testSection }).sort({ name: 1 });
    assert.equal(students.length, 5, 'Class 10 A must have 5 students');
    console.log(`Class 10 A students count: ${students.length}`);

    // Select 3 students as recognized
    const recognizedIds = [students[0].studentId, students[1].studentId, students[2].studentId];
    const unrecognizedIds = [students[3].studentId, students[4].studentId];

    console.log(`Recognized IDs (3): ${recognizedIds.join(', ')}`);
    console.log(`Unrecognized IDs (2): ${unrecognizedIds.join(', ')}`);

    // Step 2: Call POST /api/attendance/finalize
    console.log('\nCalling POST /api/attendance/finalize...');
    const finalizeRes = await fetch(`${baseUrl}/api/attendance/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        date: testDate,
        class: testClass,
        section: testSection,
        period: testPeriod,
        subject: testSubject,
        presentStudentIds: recognizedIds,
        confirm: true,
      })
    });

    const finalizeJson = await finalizeRes.json();
    console.log('Finalize Response:', JSON.stringify(finalizeJson.summary));

    assert.equal(finalizeRes.status, 200);
    assert.equal(finalizeJson.success, true);
    assert.equal(finalizeJson.summary.total, 5);
    assert.equal(finalizeJson.summary.present, 3);
    assert.equal(finalizeJson.summary.absent, 2);

    // Step 3: Verify MongoDB records
    const recordsInDb = await Attendance.find({
      class: testClass,
      section: testSection,
      date: testDate,
      period: testPeriod,
      subject: testSubject,
    }).lean();

    assert.equal(recordsInDb.length, 5);
    const presentInDb = recordsInDb.filter(r => r.status === 'Present');
    const absentInDb = recordsInDb.filter(r => r.status === 'Absent');

    assert.equal(presentInDb.length, 3);
    assert.equal(absentInDb.length, 2);

    for (const sid of recognizedIds) {
      const rec = recordsInDb.find(r => r.studentId === sid);
      assert.equal(rec.status, 'Present');
    }
    for (const sid of unrecognizedIds) {
      const rec = recordsInDb.find(r => r.studentId === sid);
      assert.equal(rec.status, 'Absent');
    }
    console.log('✅ MongoDB verification passed: 3 Present, 2 Absent');

    // Step 4: Test duplicate finalization protection without confirm: true
    console.log('\nTesting duplicate finalization protection (without confirm flag)...');
    const duplicateRes = await fetch(`${baseUrl}/api/attendance/finalize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        date: testDate,
        class: testClass,
        section: testSection,
        period: testPeriod,
        subject: testSubject,
        presentStudentIds: recognizedIds,
      })
    });
    const duplicateJson = await duplicateRes.json();
    console.log('Duplicate check response:', duplicateJson.message);
    assert.equal(duplicateJson.alreadyFinalized, true);
    assert.equal(duplicateJson.summary.total, 5);
    assert.equal(duplicateJson.summary.present, 3);
    assert.equal(duplicateJson.summary.absent, 2);
    console.log('✅ Duplicate finalization protection passed');

    // Step 5: Test GET /api/attendance/subject-wise/:studentId for a recognized student
    console.log('\nTesting Subject-Wise API for recognized student...');
    const parentTokenRec = jwt.sign(
      { id: 'parent1', email: 'parent@email.com', role: 'parent', studentId: recognizedIds[0] },
      process.env.JWT_SECRET
    );
    const subjRes = await fetch(`${baseUrl}/api/attendance/subject-wise/${recognizedIds[0]}`, {
      headers: { 'Authorization': `Bearer ${parentTokenRec}` }
    });
    const subjJson = await subjRes.json();
    const testSubjRow = subjJson.subjects.find(s => s.subject === testSubject);
    assert.ok(testSubjRow, 'Subject row must exist in subject-wise response');
    console.log(`Subject ${testSubject}: Total=${testSubjRow.totalClasses}, Present=${testSubjRow.present}, Absent=${testSubjRow.absent}, Pct=${testSubjRow.percentage}%`);
    assert.equal(testSubjRow.totalClasses, 1);
    assert.equal(testSubjRow.present, 1);
    assert.equal(testSubjRow.absent, 0);
    assert.equal(testSubjRow.percentage, 100);
    console.log('✅ Subject-Wise API passed for recognized student');

    // Step 6: Test GET /api/attendance/subject-wise/:studentId for an absent student
    console.log('\nTesting Subject-Wise API for absent student...');
    const parentTokenUnrec = jwt.sign(
      { id: 'parent2', email: 'parent2@email.com', role: 'parent', studentId: unrecognizedIds[0] },
      process.env.JWT_SECRET
    );
    const subjRes2 = await fetch(`${baseUrl}/api/attendance/subject-wise/${unrecognizedIds[0]}`, {
      headers: { 'Authorization': `Bearer ${parentTokenUnrec}` }
    });
    const subjJson2 = await subjRes2.json();
    const testSubjRow2 = subjJson2.subjects.find(s => s.subject === testSubject);
    assert.ok(testSubjRow2, 'Subject row must exist in subject-wise response');
    console.log(`Subject ${testSubject}: Total=${testSubjRow2.totalClasses}, Present=${testSubjRow2.present}, Absent=${testSubjRow2.absent}, Pct=${testSubjRow2.percentage}%`);
    assert.equal(testSubjRow2.totalClasses, 1);
    assert.equal(testSubjRow2.present, 0);
    assert.equal(testSubjRow2.absent, 1);
    assert.equal(testSubjRow2.percentage, 0);
    console.log('✅ Subject-Wise API passed for absent student');

    // Clean up
    await Attendance.deleteMany({ class: testClass, section: testSection, date: testDate, period: testPeriod, subject: testSubject });
    console.log('\n✅ Cleaned up temporary test records');

    console.log('\n🎉 ALL E2E HTTP TESTS PASSED! 🎉');

  } finally {
    server.close();
    await mongoose.disconnect();
    console.log('Disconnected and server closed');
  }
}

runE2ETests().catch(err => {
  console.error('❌ E2E Test failed:', err);
  process.exit(1);
});
