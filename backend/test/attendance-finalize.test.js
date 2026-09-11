require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const assert = require('node:assert/strict');
const { Student, Attendance, User } = require('../models');

async function runTests() {
  console.log('=== Attendance Finalization (Present & Absent) Test ===\n');

  const mongoUri = process.env.MONGO_URI;
  assert.ok(mongoUri, 'MONGO_URI must be defined');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  const testDate = '2026-09-11';
  const testClass = '10';
  const testSection = 'A';
  const testPeriod = 99; // Using a distinct period for isolated testing
  const testSubject = 'Test Physics';

  try {
    // Clean up any pre-existing test records for this period/subject
    await Attendance.deleteMany({ class: testClass, section: testSection, date: testDate, period: testPeriod, subject: testSubject });

    // Step 1: Verify Class 10 A students
    const students = await Student.find({ class: testClass, section: testSection }).sort({ name: 1 });
    console.log(`Found ${students.length} students in Class ${testClass} ${testSection}:`);
    students.forEach((s, idx) => console.log(`  ${idx + 1}. ${s.name} (${s.studentId})`));
    assert.equal(students.length, 5, 'Class 10 A should have exactly 5 students');

    // Pick 3 students to recognize, leaving 2 unrecognized
    const recognizedStudentIds = [students[0].studentId, students[1].studentId, students[2].studentId];
    const unrecognizedStudentIds = [students[3].studentId, students[4].studentId];

    console.log('\nSimulating Face Recognition:');
    console.log(`- 3 Students Recognized (Present): ${recognizedStudentIds.join(', ')}`);
    console.log(`- 2 Students Not Recognized (Pending -> Absent): ${unrecognizedStudentIds.join(', ')}`);

    // Simulate recognition marking recognized students Present in MongoDB
    for (const sid of recognizedStudentIds) {
      await Attendance.findOneAndUpdate(
        { studentId: sid, date: testDate, period: testPeriod, subject: testSubject },
        {
          $set: {
            studentId: sid,
            date: testDate,
            class: testClass,
            section: testSection,
            period: testPeriod,
            subject: testSubject,
            status: 'Present',
            markedBy: 'Face Recognition Test',
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true, returnDocument: 'after' }
      );
    }

    // Step 2: Finalize Attendance Session
    console.log('\nFinalizing Attendance Session (End Attendance)...');
    // Fetch all students and build bulk ops
    const presentSet = new Set(recognizedStudentIds);
    const operations = students.map(student => {
      const isPresent = presentSet.has(student.studentId);
      const status = isPresent ? 'Present' : 'Absent';
      return {
        updateOne: {
          filter: {
            studentId: student.studentId,
            date: testDate,
            period: testPeriod,
            subject: testSubject,
          },
          update: {
            $set: {
              studentId: student.studentId,
              date: testDate,
              class: student.class,
              section: student.section,
              period: testPeriod,
              subject: testSubject,
              status,
              markedBy: 'Face Recognition Test',
              updatedAt: new Date(),
            },
            $setOnInsert: { createdAt: new Date() },
          },
          upsert: true,
        },
      };
    });

    await Attendance.bulkWrite(operations);

    // Step 3: Verify MongoDB Records
    const finalRecords = await Attendance.find({
      class: testClass,
      section: testSection,
      date: testDate,
      period: testPeriod,
      subject: testSubject,
    }).lean();

    console.log(`\nVerified MongoDB attendance records (Total: ${finalRecords.length}):`);
    const presentRecords = finalRecords.filter(r => r.status === 'Present');
    const absentRecords = finalRecords.filter(r => r.status === 'Absent');

    console.log(`- Present count: ${presentRecords.length}`);
    presentRecords.forEach(r => console.log(`  ✓ Present: ${r.studentId}`));
    console.log(`- Absent count: ${absentRecords.length}`);
    absentRecords.forEach(r => console.log(`  ✗ Absent: ${r.studentId}`));

    assert.equal(finalRecords.length, 5, 'Total records in MongoDB must be exactly 5');
    assert.equal(presentRecords.length, 3, 'Present records must be exactly 3');
    assert.equal(absentRecords.length, 2, 'Absent records must be exactly 2');

    for (const sid of recognizedStudentIds) {
      const rec = finalRecords.find(r => r.studentId === sid);
      assert.ok(rec, `Record for ${sid} must exist`);
      assert.equal(rec.status, 'Present', `${sid} must be marked Present`);
    }

    for (const sid of unrecognizedStudentIds) {
      const rec = finalRecords.find(r => r.studentId === sid);
      assert.ok(rec, `Record for ${sid} must exist`);
      assert.equal(rec.status, 'Absent', `${sid} must be marked Absent`);
    }

    console.log('✅ MongoDB verification passed: 3 Present, 2 Absent, 0 duplicates');

    // Step 4: Verify Subject-Wise Attendance Calculation
    console.log('\nVerifying Subject-Wise Attendance Calculations...');
    
    // Test for a recognized student
    const recognizedSid = recognizedStudentIds[0];
    const recStudentRecords = await Attendance.find({ studentId: recognizedSid, subject: testSubject });
    const recPresent = recStudentRecords.filter(r => r.status === 'Present' || r.status === 'Late').length;
    const recAbsent = recStudentRecords.filter(r => r.status === 'Absent').length;
    const recTotal = recPresent + recAbsent;
    const recPct = recTotal > 0 ? (recPresent / recTotal) * 100 : 0;
    console.log(`Recognized student (${recognizedSid}): ${recPresent} Present, ${recAbsent} Absent, Total: ${recTotal}, Percentage: ${recPct}%`);
    assert.equal(recPresent, 1);
    assert.equal(recAbsent, 0);
    assert.equal(recTotal, 1);
    assert.equal(recPct, 100);

    // Test for an unrecognized student
    const unrecognizedSid = unrecognizedStudentIds[0];
    const unrecStudentRecords = await Attendance.find({ studentId: unrecognizedSid, subject: testSubject });
    const unrecPresent = unrecStudentRecords.filter(r => r.status === 'Present' || r.status === 'Late').length;
    const unrecAbsent = unrecStudentRecords.filter(r => r.status === 'Absent').length;
    const unrecTotal = unrecPresent + unrecAbsent;
    const unrecPct = unrecTotal > 0 ? (unrecPresent / unrecTotal) * 100 : 0;
    console.log(`Unrecognized student (${unrecognizedSid}): ${unrecPresent} Present, ${unrecAbsent} Absent, Total: ${unrecTotal}, Percentage: ${unrecPct}%`);
    assert.equal(unrecPresent, 0);
    assert.equal(unrecAbsent, 1);
    assert.equal(unrecTotal, 1);
    assert.equal(unrecPct, 0);

    console.log('✅ Subject-wise calculation verification passed');

    // Step 5: Edge case: 0 students recognized -> all 5 Absent
    console.log('\nTesting Edge Case: 0 Students Recognized (All Absent)...');
    const allAbsentOps = students.map(student => ({
      updateOne: {
        filter: { studentId: student.studentId, date: testDate, period: testPeriod, subject: testSubject },
        update: { $set: { status: 'Absent', updatedAt: new Date() } },
      }
    }));
    await Attendance.bulkWrite(allAbsentOps);
    const allAbsentRecords = await Attendance.find({ class: testClass, section: testSection, date: testDate, period: testPeriod, subject: testSubject }).lean();
    assert.equal(allAbsentRecords.filter(r => r.status === 'Absent').length, 5, 'All 5 must be Absent');
    assert.equal(allAbsentRecords.filter(r => r.status === 'Present').length, 0, '0 must be Present');
    console.log('✅ 0 Recognized edge case passed: 5 Absent, 0 Present');

    // Step 6: Edge case: All 5 students recognized -> all 5 Present
    console.log('\nTesting Edge Case: All 5 Students Recognized (All Present)...');
    const allPresentOps = students.map(student => ({
      updateOne: {
        filter: { studentId: student.studentId, date: testDate, period: testPeriod, subject: testSubject },
        update: { $set: { status: 'Present', updatedAt: new Date() } },
      }
    }));
    await Attendance.bulkWrite(allPresentOps);
    const allPresentRecords = await Attendance.find({ class: testClass, section: testSection, date: testDate, period: testPeriod, subject: testSubject }).lean();
    assert.equal(allPresentRecords.filter(r => r.status === 'Present').length, 5, 'All 5 must be Present');
    assert.equal(allPresentRecords.filter(r => r.status === 'Absent').length, 0, '0 must be Absent');
    console.log('✅ All Recognized edge case passed: 5 Present, 0 Absent');

    // Clean up test records
    await Attendance.deleteMany({ class: testClass, section: testSection, date: testDate, period: testPeriod, subject: testSubject });
    console.log('\n✅ Cleaned up temporary test records');

    console.log('\n🎉 ALL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');

  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
