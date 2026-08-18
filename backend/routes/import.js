const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const fs      = require('fs');
const { Student, User, Fee, Notification, Marks } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const { sendMail, sendMailToParent, passwordSetupEmail, notificationEmail } = require('../middleware/email');
const { normalizeEmail, isValidSchoolStaffEmail, DEFAULT_STAFF_PASSWORD } = require('./auth');

const upload = multer({ dest: 'uploads/' });
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// POST /api/import/staff
// JSON body example: { "staff": [{"name":"Rahul Kumar","email":"rahul@school.edu.in"},{"name":"Priya Nair","email":"priya@school.edu.in"}] }
router.post('/staff', auth, adminOnly, async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.staff) ? req.body.staff : (Array.isArray(req.body?.rows) ? req.body.rows : []);
    if (!rows.length) return res.status(400).json({ error: 'No staff records provided.' });

    const results = { created: 0, updated: 0, errors: [], skipped: 0 };

    for (const item of rows) {
      const name = String(item?.name || '').trim();
      const email = normalizeEmail(item?.email || item?.Email || '');

      if (!name || !email) {
        results.errors.push('Row skipped: missing name or email.');
        results.skipped++;
        continue;
      }

      if (!isValidSchoolStaffEmail(email)) {
        results.errors.push(`${email} is not an authorized school email. Use a @school.edu.in address.`);
        results.skipped++;
        continue;
      }

      const existing = await User.findOne({ email });
      const hashed = await bcrypt.hash(DEFAULT_STAFF_PASSWORD, 10);

      if (existing) {
        existing.name = name;
        existing.email = email;
        existing.role = 'admin';
        existing.password = hashed;
        existing.passwordSet = true;
        existing.mustChangePassword = true;
        existing.resetToken = undefined;
        existing.resetExpires = undefined;
        await existing.save();
        results.updated++;
      } else {
        await User.create({
          name,
          email,
          password: hashed,
          role: 'admin',
          passwordSet: true,
          mustChangePassword: true,
        });
        results.created++;
      }
    }

    res.json({
      message: `Staff authorization complete. ${results.created} created, ${results.updated} updated, ${results.skipped} skipped.`,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to authorize staff: ' + err.message });
  }
});

// POST /api/import/students
// Excel columns: Student_ID, Name, Class, Section, Parent_Name, Parent_Email,
//                Parent_Phone, Faculty_Name, Faculty_Email, Faculty_Whatsapp,
//                Fee_Term, Fee_Amount, Fee_Status, Fee_Due_Date
router.post('/students', auth, adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const wb   = XLSX.readFile(req.file.path);
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    fs.unlinkSync(req.file.path);

    if (!rows.length) return res.status(400).json({ error: 'No data rows found in Excel file.' });

    const results = { created: 0, updated: 0, marksImported: 0, errors: [], emailsSent: 0 };
    const emailedStudents = new Set();

    for (const row of rows) {
      try {
        const studentId   = String(row['Student_ID'] || row['student_id'] || '').trim();
        const parentEmail = String(row['Parent_Email'] || row['parent_email'] || '').trim().toLowerCase();
        if (!studentId || !parentEmail) { results.errors.push(`Row skipped: missing Student_ID or Parent_Email`); continue; }

        // Upsert student
        const studentData = {
          studentId,
          name:            String(row['Name'] || '').trim(),
          class:           String(row['Class'] || '').trim(),
          section:         String(row['Section'] || '').trim(),
          rollNumber:      String(row['Roll_Number'] || '').trim(),
          dateOfBirth:     String(row['DOB'] || '').trim(),
          parentName:      String(row['Parent_Name'] || '').trim(),
          parentEmail,
          parentPhone:     String(row['Parent_Phone'] || '').trim(),
          facultyName:     String(row['Faculty_Name'] || '').trim(),
          facultyEmail:    String(row['Faculty_Email'] || '').trim(),
          facultyWhatsapp: String(row['Faculty_Whatsapp'] || '').trim(),
          address:         String(row['Address'] || '').trim(),
        };
        const existing = await Student.findOne({ studentId });
        if (existing) {
          await Student.findOneAndUpdate({ studentId }, studentData);
          results.updated++;
        } else {
          await Student.create(studentData);
          results.created++;
        }

        // Fee record
        if (row['Fee_Term'] && row['Fee_Amount']) {
          await Fee.findOneAndUpdate(
            { studentId, term: String(row['Fee_Term']).trim() },
            { amount: parseFloat(row['Fee_Amount']) || 0, status: row['Fee_Status'] || 'Due', dueDate: String(row['Fee_Due_Date'] || '') },
            { upsert: true }
          );
        }

        // Marks record
        const markSubject = String(row['Subject'] || row['subject'] || '').trim();
        const examType = String(row['Exam_Type'] || row['exam_type'] || row['Exam Type'] || 'Mid-Term').trim();
        const score = row['Score'] != null && row['Score'] !== '' ? parseFloat(row['Score']) : NaN;
        const maxScore = row['Max_Score'] != null && row['Max_Score'] !== '' ? parseFloat(row['Max_Score']) : NaN;
        const remarks = String(row['Remarks'] || row['remarks'] || '').trim();
        if (markSubject && !Number.isNaN(score) && !Number.isNaN(maxScore)) {
          await Marks.findOneAndUpdate(
            { studentId, subject: markSubject, examType },
            { score, maxScore, remarks, updatedAt: new Date() },
            { upsert: true, new: true }
          );
          results.marksImported++;
        }

        // Create or update parent user account and always send a fresh setup link
        let parentUser = await User.findOne({ email: parentEmail });
        const isNewParent = !parentUser;
        const setupToken   = crypto.randomBytes(32).toString('hex');
        const setupExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        const setupUrl     = `${FRONTEND_URL}/set-password.html?token=${setupToken}`;

        if (isNewParent) {
          // Placeholder password until parent sets their own via email link
          const placeholder = crypto.randomBytes(32).toString('hex');
          const hashed = await bcrypt.hash(placeholder, 10);

          parentUser = await User.create({
            email: parentEmail,
            password: hashed,
            role: 'parent',
            studentId,
            name: studentData.parentName || studentData.name + "'s Parent",
            passwordSet: false,
            resetToken: setupToken,
            resetExpires: setupExpires,
          });
        } else {
          // Existing parent: update studentId, reset token, and keep passwordSet false until they choose a new password
          parentUser.studentId = studentId;
          parentUser.resetToken = setupToken;
          parentUser.resetExpires = setupExpires;
          parentUser.passwordSet = false;
          await parentUser.save();
        }

        const html = passwordSetupEmail(
          studentData.parentName || 'Parent',
          parentEmail,
          studentData.name,
          setupUrl
        );
        const emailSubject = isNewParent
          ? `Welcome to ${process.env.SCHOOL_NAME || 'EduConnect'} — Your Login Credentials`
          : `Password Setup Link for ${process.env.SCHOOL_NAME || 'EduConnect'}`;
        const sent = await sendMailToParent(parentEmail, studentData.parentPhone, emailSubject, html);
        if (sent) results.emailsSent++;

        // Welcome or reset notification
        await Notification.create({
          targetEmail: parentEmail,
          type: 'success',
          title: isNewParent ? '👋 Parent Portal Access' : '🔁 Password Setup Link Sent',
          message: isNewParent
            ? `A password setup link has been sent to ${parentEmail} for ${studentData.name}.`
            : `A new password setup link has been resent to ${parentEmail} for ${studentData.name}.`,
        });

        // Notify parent when marks are imported for this student
        if (markSubject && !Number.isNaN(score) && !Number.isNaN(maxScore) && !emailedStudents.has(studentId)) {
          const student = await Student.findOne({ studentId });
          if (student && student.parentEmail) {
            const title = `📚 Results Published for ${student.name}`;
            const message = `Dear ${student.parentName || 'Parent'}, results for ${student.name} have been published. Please log in to the parent portal to view detailed marks.`;
            const html = notificationEmail(student.parentName || 'Parent', title, message, student.name);
            const sent = await sendMailToParent(student.parentEmail, student.parentPhone, title, html);
            if (sent) results.emailsSent++;
            await Notification.create({ targetEmail: student.parentEmail, type: 'success', title, message });
            emailedStudents.add(studentId);
          }
        }
      } catch (rowErr) {
        results.errors.push(`Row error: ${rowErr.message}`);
      }
    }

    res.json({
      message: `Import complete. ${results.created} new, ${results.updated} updated, ${results.marksImported} marks imported, ${results.emailsSent} emails sent.`,
      results,
      total: rows.length,
    });

  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: 'Failed to parse file: ' + err.message });
  }
});

// POST /api/import/marks
// Excel columns: Student_ID, Subject, Exam_Type, Score, Max_Score, Remarks (optional)
router.post('/marks', auth, adminOnly, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

  try {
    const wb   = XLSX.readFile(req.file.path);
    const ws   = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws);
    fs.unlinkSync(req.file.path);

    if (!rows.length) return res.status(400).json({ error: 'No data rows found in Excel file.' });

    const results = { imported: 0, errors: [], emailsSent: 0 };
    const emailedStudents = new Set();

    for (const row of rows) {
      try {
        const studentId = String(row['Student_ID'] || row['student_id'] || '').trim();
        const subject = String(row['Subject'] || row['subject'] || '').trim();
        const examType = String(row['Exam_Type'] || row['exam_type'] || row['Exam Type'] || 'Mid-Term').trim();
        const score = row['Score'] != null && row['Score'] !== '' ? parseFloat(row['Score']) : NaN;
        const maxScore = row['Max_Score'] != null && row['Max_Score'] !== '' ? parseFloat(row['Max_Score']) : NaN;
        const remarks = String(row['Remarks'] || row['remarks'] || '').trim();

        if (!studentId || !subject || Number.isNaN(score) || Number.isNaN(maxScore)) {
          results.errors.push(`Row skipped: missing Student_ID, Subject, Score or Max_Score`);
          continue;
        }

        const student = await Student.findOne({ studentId });
        if (!student) {
          results.errors.push(`Row skipped: student ${studentId} not found`);
          continue;
        }

        await Marks.findOneAndUpdate(
          { studentId, subject, examType },
          { score, maxScore, remarks, updatedAt: new Date() },
          { upsert: true, new: true }
        );
        results.imported++;

        if (!emailedStudents.has(studentId) && student.parentEmail) {
          const title = `📚 Results Published for ${student.name}`;
          const message = `Dear ${student.parentName || 'Parent'}, results for ${student.name} have been published. Please log in to the parent portal to view detailed marks.`;
          const html = notificationEmail(student.parentName || 'Parent', title, message, student.name);
          const sent = await sendMailToParent(student.parentEmail, student.parentPhone, title, html);
          if (sent) results.emailsSent++;
          await Notification.create({ targetEmail: student.parentEmail, type: 'success', title, message });
          emailedStudents.add(studentId);
        }
      } catch (rowErr) {
        results.errors.push(`Row error: ${rowErr.message}`);
      }
    }

    res.json({
      message: `Marks import complete. ${results.imported} records imported, ${results.emailsSent} emails sent.`,
      results,
      total: rows.length,
    });

  } catch (err) {
    try { fs.unlinkSync(req.file.path); } catch {}
    res.status(500).json({ error: 'Failed to parse file: ' + err.message });
  }
});

module.exports = router;
