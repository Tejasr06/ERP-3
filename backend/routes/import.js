const router  = require('express').Router();
const multer  = require('multer');
const XLSX    = require('xlsx');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const fs      = require('fs');
const { Student, User, Fee, Notification, Marks } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const { sendMail, sendMailToParent, passwordSetupEmail, notificationEmail } = require('../middleware/email');

const upload = multer({ dest: 'uploads/' });

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

        // Create parent user account if not exists
        let parentUser = await User.findOne({ email: parentEmail });
        const isNewParent = !parentUser;

        if (isNewParent) {
          // Placeholder password until parent sets their own via email link
          const placeholder = crypto.randomBytes(32).toString('hex');
          const hashed = await bcrypt.hash(placeholder, 10);

          const setupToken   = crypto.randomBytes(32).toString('hex');
          const setupExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

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

          const setupUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/set-password.html?token=${setupToken}`;
          const html = passwordSetupEmail(
            studentData.parentName || 'Parent',
            parentEmail,
            studentData.name,
            setupUrl
          );
          const sent = await sendMailToParent(parentEmail, studentData.parentPhone, `Welcome to ${process.env.SCHOOL_NAME || 'EduConnect'} — Your Login Credentials`, html);
          if (sent) results.emailsSent++;

          // Welcome notification
          await Notification.create({
            targetEmail: parentEmail,
            type: 'success',
            title: '👋 Welcome to EduConnect!',
            message: `Your parent portal account has been created for ${studentData.name}. Use the link in your welcome email to set your password.`,
          });
        } else if (parentUser.studentId !== studentId) {
          // Update linked student if changed
          await User.findByIdAndUpdate(parentUser._id, { studentId });
        }

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
