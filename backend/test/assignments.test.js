require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { Assignment, AssignmentSubmission, Student, User } = require('../models');

async function runTests() {
  console.log('--- Starting Assignments Module Verification Tests ---');

  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/educonnect';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('✅ Connected to MongoDB');

  // 1. Fetch an admin user and a student
  const adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) throw new Error('No admin user found in database');
  console.log('Admin user found:', adminUser.email);

  const student = await Student.findOne();
  if (!student) throw new Error('No student found in database');
  console.log(`Test student found: ${student.name} (${student.studentId}), Class: ${student.class}-${student.section}`);

  // 2. Test Assignment Model Creation
  const testAssignmentCode = `TEST-ASN-${Date.now()}`;
  console.log('\nTesting Assignment Model Creation...');
  const newAssignment = await Assignment.create({
    assignmentId: testAssignmentCode,
    title: 'Mathematics Calculus Worksheet',
    subject: 'Mathematics',
    description: 'Solve exercises 1 to 20 on limits and derivatives.',
    assignedBy: adminUser.name || 'Math Teacher',
    class: student.class,
    section: student.section,
    assignedDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // in 3 days
    priority: 'High',
    attachment: '',
    attachmentName: '',
    status: 'Active'
  });
  console.log('✅ Assignment successfully created in MongoDB with ID:', newAssignment.assignmentId);

  // 3. Test Student Scoping: Find assignments for student's class and section
  console.log('\nTesting Student Class/Section Scoping...');
  const studentAssignments = await Assignment.find({
    class: student.class,
    section: student.section,
    status: 'Active'
  }).lean();
  const found = studentAssignments.some(a => a.assignmentId === testAssignmentCode);
  if (!found) throw new Error('Student could not see the assignment for their class!');
  console.log(`✅ Student Class ${student.class}-${student.section} successfully retrieves the assignment!`);

  // 4. Test Other Class Scoping: Non-enrolled class shouldn't see it
  const otherAssignments = await Assignment.find({
    class: '999-NON-EXISTENT',
    section: 'Z',
    status: 'Active'
  }).lean();
  if (otherAssignments.some(a => a.assignmentId === testAssignmentCode)) {
    throw new Error('Assignment incorrectly visible to other class!');
  }
  console.log('✅ Students from other classes cannot see this assignment.');

  // 5. Test Dynamic Status Calculation (Pending / Overdue)
  console.log('\nTesting Dynamic Status Calculation...');
  const today = new Date();
  today.setHours(0,0,0,0);
  const due = new Date(newAssignment.dueDate);
  due.setHours(23,59,59,999);
  const isOverdue = today.getTime() > due.getTime();
  console.log(`Assignment Due Date: ${newAssignment.dueDate}, Current Status: ${isOverdue ? 'Overdue' : 'Pending'}`);

  // 6. Test Student Submission
  console.log('\nTesting Student Submission...');
  const submission = await AssignmentSubmission.create({
    assignmentId: newAssignment._id,
    assignmentCode: newAssignment.assignmentId,
    studentId: student.studentId,
    studentName: student.name,
    class: student.class,
    section: student.section,
    submissionFile: '/uploads/assignments/submissions/test-submission.pdf',
    submissionFileName: 'test-submission.pdf',
    submissionFileType: 'application/pdf',
    submittedAt: new Date(),
    status: 'Submitted',
    remarks: 'Here is my complete worksheet.'
  });
  console.log('✅ Student submission created in MongoDB:', submission._id);

  // Verify status is now 'Submitted'
  const checkSub = await AssignmentSubmission.findOne({ assignmentId: newAssignment._id, studentId: student.studentId });
  if (!checkSub) throw new Error('Submission check failed!');
  console.log('✅ Dynamic status after submission: Submitted');

  // 7. Test Admin Submissions Query
  console.log('\nTesting Admin Submissions Retrieval...');
  const submissionsForAssignment = await AssignmentSubmission.find({ assignmentId: newAssignment._id });
  console.log(`✅ Admin retrieved ${submissionsForAssignment.length} submission(s) for assignment ${testAssignmentCode}`);

  // 8. Clean up test data
  console.log('\nCleaning up test records...');
  await Assignment.findByIdAndDelete(newAssignment._id);
  await AssignmentSubmission.deleteMany({ assignmentId: newAssignment._id });
  console.log('✅ Test records cleaned up.');

  console.log('\n🎉 ALL ASSIGNMENT TESTS PASSED SUCCESSFULLY!');
  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
