// ╔════════════════════════════════════════════════════════════╗
// ║   Comprehensive Attendance Reports & Download Test Suite  ║
// ╚════════════════════════════════════════════════════════════╝

const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Student, Attendance, User } = require('../models');
const apiRoutes = require('../routes/api');

async function runTests() {
  console.log('=== Starting Attendance Report & Download Test Suite ===\n');

  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in .env');
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB Atlas');

  const app = express();
  app.use(express.json());
  app.use('/api', apiRoutes);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`✅ Test server running on port ${port}`);

  const adminToken = jwt.sign(
    { email: 'admin@educonnect.com', role: 'admin', name: 'Test Admin' },
    process.env.JWT_SECRET || 'secret'
  );

  const parentToken = jwt.sign(
    { email: 'parent@educonnect.com', role: 'parent', studentId: '1SB23IS002', name: 'Parent User' },
    process.env.JWT_SECRET || 'secret'
  );

  function makeRequest(urlPath, options = {}) {
    return new Promise((resolve, reject) => {
      const opts = {
        hostname: 'localhost',
        port,
        path: urlPath,
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${options.token || adminToken}`,
          'Content-Type': 'application/json',
          ...(options.headers || {})
        }
      };

      const req = http.request(opts, res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const contentType = res.headers['content-type'] || '';
          let body = null;
          if (contentType.includes('application/json')) {
            try { body = JSON.parse(buffer.toString()); } catch {}
          }
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            buffer,
            text: buffer.toString(),
            body
          });
        });
      });

      req.on('error', reject);
      if (options.body) {
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      req.end();
    });
  }

  const TEST_DATE_1 = '2026-09-01';
  const TEST_DATE_2 = '2026-09-02';
  const TEST_DATE_3 = '2026-09-03';
  const TEST_CLASS = '10';
  const TEST_SECTION = 'A';
  const TEST_SUBJECT_MATH = 'Report Math';
  const TEST_SUBJECT_SCI = 'Report Science';

  // Seed sample attendance records for Class 10 Section A
  // Students in 10 A: 1SB23IS002, 1SB23IS018, 1SB23CS035, 1SB23EC073, 1SB23IS056
  const students = await Student.find({ class: TEST_CLASS, section: TEST_SECTION }).sort({ studentId: 1 });
  console.log(`Found ${students.length} students in Class ${TEST_CLASS}-${TEST_SECTION}`);

  // Clean up any old test records for these test subjects
  await Attendance.deleteMany({
    class: TEST_CLASS,
    section: TEST_SECTION,
    subject: { $in: [TEST_SUBJECT_MATH, TEST_SUBJECT_SCI] }
  });

  // Seed Day 1 Math (Period 1): 3 Present, 2 Absent
  const seedRecords = [
    { studentId: '1SB23IS002', date: TEST_DATE_1, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Present' },
    { studentId: '1SB23IS018', date: TEST_DATE_1, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Present' },
    { studentId: '1SB23CS035', date: TEST_DATE_1, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Present' },
    { studentId: '1SB23EC073', date: TEST_DATE_1, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Absent' },
    { studentId: '1SB23IS056', date: TEST_DATE_1, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Absent' },

    // Seed Day 2 Math (Period 1): 4 Present, 1 Absent
    { studentId: '1SB23IS002', date: TEST_DATE_2, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Present' },
    { studentId: '1SB23IS018', date: TEST_DATE_2, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Present' },
    { studentId: '1SB23CS035', date: TEST_DATE_2, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Absent' },
    { studentId: '1SB23EC073', date: TEST_DATE_2, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Present' },
    { studentId: '1SB23IS056', date: TEST_DATE_2, class: TEST_CLASS, section: TEST_SECTION, period: 1, subject: TEST_SUBJECT_MATH, status: 'Present' },

    // Seed Day 3 Science (Period 2): 5 Present, 0 Absent
    { studentId: '1SB23IS002', date: TEST_DATE_3, class: TEST_CLASS, section: TEST_SECTION, period: 2, subject: TEST_SUBJECT_SCI, status: 'Present' },
    { studentId: '1SB23IS018', date: TEST_DATE_3, class: TEST_CLASS, section: TEST_SECTION, period: 2, subject: TEST_SUBJECT_SCI, status: 'Present' },
    { studentId: '1SB23CS035', date: TEST_DATE_3, class: TEST_CLASS, section: TEST_SECTION, period: 2, subject: TEST_SUBJECT_SCI, status: 'Present' },
    { studentId: '1SB23EC073', date: TEST_DATE_3, class: TEST_CLASS, section: TEST_SECTION, period: 2, subject: TEST_SUBJECT_SCI, status: 'Present' },
    { studentId: '1SB23IS056', date: TEST_DATE_3, class: TEST_CLASS, section: TEST_SECTION, period: 2, subject: TEST_SUBJECT_SCI, status: 'Present' },
  ];

  await Attendance.insertMany(seedRecords);
  console.log('✅ Inserted seeded test attendance records\n');

  try {
    // ── Test 1: Role Security Check ──
    console.log('--- Test 1: Security & Role Check ---');
    const unauthorizedRes = await makeRequest('/api/attendance/report', { token: parentToken });
    if (unauthorizedRes.statusCode !== 403) {
      throw new Error(`Expected 403 for parent token, got ${unauthorizedRes.statusCode}`);
    }
    console.log('✅ Parent/Student access correctly blocked with 403 Forbidden');

    const adminRes = await makeRequest('/api/attendance/report?class=10&section=A');
    if (adminRes.statusCode !== 200) {
      throw new Error(`Expected 200 for admin token, got ${adminRes.statusCode}`);
    }
    console.log('✅ Admin access allowed with 200 OK\n');

    // ── Test 2: Single Subject Report (Daily Grid) ──
    console.log('--- Test 2: Single Subject Attendance Report (Daily Grid) ---');
    const mathReportRes = await makeRequest(
      `/api/attendance/report?class=10&section=A&subject=${encodeURIComponent(TEST_SUBJECT_MATH)}&startDate=${TEST_DATE_1}&endDate=${TEST_DATE_2}`
    );
    const mathData = mathReportRes.body;
    console.log('Summary:', mathData.summary);
    if (mathData.summary.totalStudents !== 5) throw new Error(`Expected 5 total students, got ${mathData.summary.totalStudents}`);
    if (mathData.summary.totalClassesConducted !== 2) throw new Error(`Expected 2 classes conducted, got ${mathData.summary.totalClassesConducted}`);
    if (mathData.summary.totalPresent !== 7) throw new Error(`Expected 7 total present, got ${mathData.summary.totalPresent}`);
    if (mathData.summary.totalAbsent !== 3) throw new Error(`Expected 3 total absent, got ${mathData.summary.totalAbsent}`);
    // Overall pct: 7 / (7 + 3) * 100 = 70.0%
    if (mathData.summary.overallPercentage !== '70.0%') throw new Error(`Expected 70.0% overall percentage, got ${mathData.summary.overallPercentage}`);

    // Check individual student row
    const stu1 = mathData.dailyGrid.rows.find(r => r.studentId === '1SB23IS002');
    if (!stu1 || stu1.presentCount !== 2 || stu1.absentCount !== 0 || stu1.percentage !== '100.0%') {
      throw new Error(`Student 1SB23IS002 stats mismatch: ${JSON.stringify(stu1)}`);
    }
    const stu4 = mathData.dailyGrid.rows.find(r => r.studentId === '1SB23EC073');
    // Day 1 Absent, Day 2 Present -> 1 Present, 1 Absent = 50.0%
    if (!stu4 || stu4.presentCount !== 1 || stu4.absentCount !== 1 || stu4.percentage !== '50.0%') {
      throw new Error(`Student 1SB23EC073 stats mismatch: ${JSON.stringify(stu4)}`);
    }
    console.log('✅ Daily Grid report calculations verified (70% overall, individual 100% and 50%)\n');

    // ── Test 3: Subject-Wise Summary ("All Subjects") ──
    console.log('--- Test 3: Subject-Wise Attendance Summary ("All Subjects") ---');
    const allSubRes = await makeRequest(
      `/api/attendance/report?class=10&section=A&subject=All&startDate=${TEST_DATE_1}&endDate=${TEST_DATE_3}&viewMode=subject`
    );
    const allSubData = allSubRes.body;
    console.log('Subjects found:', allSubData.subjectWise.subjects);
    if (!allSubData.subjectWise.subjects.includes(TEST_SUBJECT_MATH) || !allSubData.subjectWise.subjects.includes(TEST_SUBJECT_SCI)) {
      throw new Error('Expected both test subjects in subjectWise.subjects');
    }
    const stu1Sub = allSubData.subjectWise.rows.find(r => r.studentId === '1SB23IS002');
    console.log('Student 1SB23IS002 subject-wise stats:', stu1Sub.subjects, 'Overall:', stu1Sub.overallPercentage);
    if (stu1Sub.subjects[TEST_SUBJECT_MATH].percentage !== '100.0%') throw new Error('Expected 100% Math for 1SB23IS002');
    if (stu1Sub.subjects[TEST_SUBJECT_SCI].percentage !== '100.0%') throw new Error('Expected 100% Science for 1SB23IS002');
    if (stu1Sub.overallPercentage !== '100.0%') throw new Error('Expected 100% overall for 1SB23IS002');
    console.log('✅ Subject-Wise Summary report calculations verified\n');

    // ── Test 4: Date-Wise Summary ──
    console.log('--- Test 4: Date-Wise Attendance Summary ---');
    const dateWiseRes = await makeRequest(
      `/api/attendance/report?class=10&section=A&startDate=${TEST_DATE_1}&endDate=${TEST_DATE_3}&viewMode=date`
    );
    const dateWiseData = dateWiseRes.body;
    console.log('Date-wise sessions count:', dateWiseData.dateWise.rows.length);
    const day1Session = dateWiseData.dateWise.rows.find(r => r.date === TEST_DATE_1 && r.subject === TEST_SUBJECT_MATH);
    if (!day1Session || day1Session.present !== 3 || day1Session.absent !== 2 || day1Session.percentage !== '60.0%') {
      throw new Error(`Day 1 session mismatch: ${JSON.stringify(day1Session)}`);
    }
    console.log('✅ Date-Wise Summary verified (Day 1 Math: 3 Present, 2 Absent = 60.0%)\n');

    // ── Test 5: Excel Download (.xlsx) ──
    console.log('--- Test 5: Excel Report Download ---');
    const excelRes = await makeRequest(
      `/api/attendance/report/excel?class=10&section=A&subject=${encodeURIComponent(TEST_SUBJECT_MATH)}&startDate=${TEST_DATE_1}&endDate=${TEST_DATE_2}`
    );
    if (excelRes.statusCode !== 200) throw new Error(`Excel download failed with status ${excelRes.statusCode}`);
    if (!excelRes.headers['content-type'].includes('spreadsheetml')) {
      throw new Error(`Unexpected Content-Type for Excel: ${excelRes.headers['content-type']}`);
    }
    const excelDisp = excelRes.headers['content-disposition'] || '';
    console.log('Content-Disposition:', excelDisp);
    if (!excelDisp.includes('.xlsx') || !excelDisp.includes('EduConnect_Attendance')) {
      throw new Error(`Invalid Content-Disposition: ${excelDisp}`);
    }
    // Check OOXML signature (starts with PK\x03\x04)
    if (excelRes.buffer[0] !== 0x50 || excelRes.buffer[1] !== 0x4B) {
      throw new Error('Excel file does not have valid PK zip header');
    }
    console.log(`✅ Excel download verified (Buffer size: ${excelRes.buffer.length} bytes, valid OOXML)\n`);

    // ── Test 6: PDF Download (.pdf) ──
    console.log('--- Test 6: PDF Report Download ---');
    const pdfRes = await makeRequest(
      `/api/attendance/report/pdf?class=10&section=A&subject=${encodeURIComponent(TEST_SUBJECT_MATH)}&startDate=${TEST_DATE_1}&endDate=${TEST_DATE_2}`
    );
    if (pdfRes.statusCode !== 200) throw new Error(`PDF download failed with status ${pdfRes.statusCode}`);
    if (!pdfRes.headers['content-type'].includes('application/pdf')) {
      throw new Error(`Unexpected Content-Type for PDF: ${pdfRes.headers['content-type']}`);
    }
    const pdfDisp = pdfRes.headers['content-disposition'] || '';
    console.log('Content-Disposition:', pdfDisp);
    if (!pdfDisp.includes('.pdf') || !pdfDisp.includes('EduConnect_Attendance')) {
      throw new Error(`Invalid Content-Disposition for PDF: ${pdfDisp}`);
    }
    // Check PDF signature (%PDF-)
    if (pdfRes.text.slice(0, 5) !== '%PDF-') {
      throw new Error('PDF file does not start with %PDF-');
    }
    console.log(`✅ PDF download verified (Buffer size: ${pdfRes.buffer.length} bytes, valid PDF header)\n`);

    // ── Test 7: CSV Download (.csv) ──
    console.log('--- Test 7: CSV Report Download ---');
    const csvRes = await makeRequest(
      `/api/attendance/report/csv?class=10&section=A&subject=${encodeURIComponent(TEST_SUBJECT_MATH)}&startDate=${TEST_DATE_1}&endDate=${TEST_DATE_2}`
    );
    if (csvRes.statusCode !== 200) throw new Error(`CSV download failed with status ${csvRes.statusCode}`);
    if (!csvRes.headers['content-type'].includes('text/csv')) {
      throw new Error(`Unexpected Content-Type for CSV: ${csvRes.headers['content-type']}`);
    }
    const csvDisp = csvRes.headers['content-disposition'] || '';
    console.log('Content-Disposition:', csvDisp);
    if (!csvDisp.includes('.csv') || !csvDisp.includes('EduConnect_Attendance')) {
      throw new Error(`Invalid Content-Disposition for CSV: ${csvDisp}`);
    }
    // Check UTF-8 BOM (\uFEFF)
    if (csvRes.buffer[0] !== 0xEF || csvRes.buffer[1] !== 0xBB || csvRes.buffer[2] !== 0xBF) {
      throw new Error('CSV file does not have UTF-8 BOM');
    }
    if (!csvRes.text.includes('EduConnect Attendance Report') || !csvRes.text.includes('1SB23IS002')) {
      throw new Error('CSV text missing expected attendance content');
    }
    console.log(`✅ CSV download verified (Buffer size: ${csvRes.buffer.length} bytes, contains BOM and student rows)\n`);

    // Clean up test records
    await Attendance.deleteMany({
      class: TEST_CLASS,
      section: TEST_SECTION,
      subject: { $in: [TEST_SUBJECT_MATH, TEST_SUBJECT_SCI] }
    });
    console.log('✅ Cleaned up test attendance records');

    console.log('\n🎉 ALL ATTENDANCE REPORT TESTS PASSED PERFECTLY! 🎉\n');
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
