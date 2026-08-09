const router = require('express').Router();
const { Student, Attendance, Marks, Fee, Notification, Message, AlertLog, User, Payment } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const { sendMail, sendMailToParent, sendMailToParentWithOptions, notificationEmail, attendanceAlertEmail } = require('../middleware/email');
const { generateReceiptPDF } = require('../utils/pdfGenerator');

// ── STUDENTS ─────────────────────────────────────────

// GET /api/students/me — parent gets own student info
router.get('/students/me', auth, async (req, res) => {
  const student = await Student.findOne({ studentId: req.user.studentId });
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  res.json(student);
});

// GET /api/students — admin gets all
router.get('/students', auth, adminOnly, async (req, res) => {
  const students = await Student.find().sort({ name: 1 });
  res.json(students);
});

// GET /api/students/:id — admin gets one
router.get('/students/:id', auth, adminOnly, async (req, res) => {
  const student = await Student.findOne({ studentId: req.params.id });
  if (!student) return res.status(404).json({ error: 'Not found.' });
  res.json(student);
});

// ── ATTENDANCE ────────────────────────────────────────

// GET /api/attendance/:studentId
router.get('/attendance/:studentId', auth, async (req, res) => {
  // Parents can only see their own child
  if (req.user.role === 'parent' && req.user.studentId !== req.params.studentId)
    return res.status(403).json({ error: 'Access denied.' });

  const records = await Attendance.find({ studentId: req.params.studentId }).sort({ date: -1 });
  const total   = records.length;
  const present = records.filter(r => r.status === 'Present').length;
  const absent  = records.filter(r => r.status === 'Absent').length;
  const pct     = total > 0 ? Math.round((present / total) * 100) : 0;
  res.json({ records, summary: { total, present, absent, percentage: pct } });
});

// POST /api/attendance — admin adds records
router.post('/attendance', auth, adminOnly, async (req, res) => {
  const { records } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'records[] required.' });
  await Attendance.insertMany(records);
  // Check each student for low attendance
  const studentIds = [...new Set(records.map(r => r.studentId))];
  for (const sid of studentIds) await checkAttendanceAlert(sid);
  res.json({ message: `${records.length} attendance records saved.` });
});

async function checkAttendanceAlert(studentId) {
  const records = await Attendance.find({ studentId });
  if (!records.length) return;
  const pct = Math.round(records.filter(r => r.status === 'Present').length / records.length * 100);
  if (pct < 75) {
    const student = await Student.findOne({ studentId });
    if (!student) return;
    const title = `⚠️ Attendance Alert — ${pct}%`;
    const msg   = `${student.name}'s attendance has dropped to ${pct}%, below the required 75%.`;
    // Create in-app notification
    await Notification.create({ targetEmail: student.parentEmail, type: 'danger', title, message: msg });
    // Send email
    const html = attendanceAlertEmail(student.parentName || 'Parent', student.name, pct);
    await sendMailToParent(student.parentEmail, student.parentPhone, title, html);
    await AlertLog.create({ recipient: student.parentEmail, type: 'Email', subject: title, message: msg });
  }
}

// ── MARKS ─────────────────────────────────────────────

// GET /api/marks/:studentId?examType=Mid-Term
router.get('/marks/:studentId', auth, async (req, res) => {
  if (req.user.role === 'parent' && req.user.studentId !== req.params.studentId)
    return res.status(403).json({ error: 'Access denied.' });
  const filter = { studentId: req.params.studentId };
  if (req.query.examType) filter.examType = req.query.examType;
  const marks = await Marks.find(filter).sort({ subject: 1 });
  res.json(marks);
});

// GET /api/debug/marks/:studentId (ADMIN ONLY - debug endpoint)
router.get('/debug/marks/:studentId', auth, adminOnly, async (req, res) => {
  const sid = req.params.studentId;
  const student = await Student.findOne({ studentId: sid });
  const parentUser = await User.findOne({ studentId: sid, role: 'parent' });
  const marks = await Marks.find({ studentId: sid });
  const allStudents = await Student.find().select('studentId name parentEmail');
  const allMarks = await Marks.find().select('studentId subject examType score maxScore');
  
  res.json({
    queryFor: sid,
    student: student ? { id: student.studentId, name: student.name, email: student.parentEmail } : null,
    parentUser: parentUser ? { email: parentUser.email, studentId: parentUser.studentId } : null,
    marksCount: marks.length,
    marksSample: marks.slice(0, 5),
    allStudentsCount: allStudents.length,
    allStudents: allStudents.map(s => s.studentId),
    allMarksCount: allMarks.length,
    uniqueMarksStudentIds: [...new Set(allMarks.map(m => m.studentId))]
  });
});

// POST /api/marks — admin upserts marks
router.post('/marks', auth, adminOnly, async (req, res) => {
  const { studentId, subject, examType, score, maxScore, remarks } = req.body;
  if (!studentId || !subject || !examType || score == null || !maxScore)
    return res.status(400).json({ error: 'All fields required.' });
  await Marks.findOneAndUpdate(
    { studentId, subject, examType },
    { score, maxScore, remarks, updatedAt: new Date() },
    { upsert: true, new: true }
  );
  res.json({ message: 'Marks saved.' });
});

// ── FEES ──────────────────────────────────────────────

// GET /api/fees/payment-history — parent payment receipts (must be before /fees/:studentId)
router.get('/fees/payment-history', auth, async (req, res) => {
  if (req.user.role !== 'parent') return res.status(403).json({ error: 'Access denied.' });
  if (!req.user.studentId) return res.status(400).json({ error: 'No student linked to this account.' });

  const payments = await Payment.find({ studentId: req.user.studentId, status: 'success' })
    .populate('feeId')
    .sort({ paymentDate: -1 });

  res.json(payments);
});

// GET /api/fees/:studentId
router.get('/fees/:studentId', auth, async (req, res) => {
  const reserved = ['payment-history', 'my-fees', 'statistics', 'structures', 'track-payments', 'transactions', 'report'];
  if (reserved.includes(req.params.studentId)) {
    return res.status(404).json({ error: 'Route not found.' });
  }
  if (req.user.role === 'parent' && req.user.studentId !== req.params.studentId)
    return res.status(403).json({ error: 'Access denied.' });

  const feesRaw = await Fee.find({ studentId: req.params.studentId });

  // Normalize balance for frontend (some records have status Due but balance 0)
  const fees = feesRaw.map(f => {
    const obj = f.toObject ? f.toObject() : f;
    const paid = obj.amountPaid || 0;
    const isPaid = String(obj.status || '').toLowerCase() === 'paid';
    if (isPaid) {
      obj.balance = 0;
    } else {
      const owed = Math.max(0, obj.amount - paid);
      obj.balance = (obj.balance != null && obj.balance > 0) ? obj.balance : owed;
    }
    return obj;
  });

  const totalDue = fees.reduce((s, f) => s + (f.balance || 0), 0);

  const payments = await Payment.find({ studentId: req.params.studentId, status: 'success' })
    .populate('feeId')
    .sort({ paymentDate: -1 });

  res.json({ fees, totalDue, payments });
});

// ── NOTIFICATIONS ─────────────────────────────────────

// GET /api/notifications
router.get('/notifications', auth, async (req, res) => {
  const notifs = await Notification.find({ targetEmail: req.user.email }).sort({ createdAt: -1 });
  const unread  = notifs.filter(n => !n.isRead).length;
  res.json({ notifications: notifs, unread });
});

// PUT /api/notifications/read-all
router.put('/notifications/read-all', auth, async (req, res) => {
  await Notification.updateMany({ targetEmail: req.user.email }, { isRead: true });
  res.json({ message: 'All read.' });
});

// POST /api/notifications/send — admin sends notification to a parent
router.post('/notifications/send', auth, adminOnly, async (req, res) => {
  const { targetEmail, title, message, type, sendEmail: doEmail } = req.body;
  if (!targetEmail || !title || !message) return res.status(400).json({ error: 'targetEmail, title, message required.' });

  const notif = await Notification.create({ targetEmail, type: type || 'info', title, message });

  if (doEmail) {
    const student = await Student.findOne({ parentEmail: targetEmail });
    const html = notificationEmail(student?.parentName || 'Parent', title, message, student?.name || '');
    await sendMailToParent(targetEmail, student?.parentPhone, title, html);
    notif.sentEmail = true;
    await notif.save();
    await AlertLog.create({ recipient: targetEmail, type: 'Email', subject: title, message });
  }
  res.json({ message: 'Notification sent.', notif });
});

// ── MESSAGES ──────────────────────────────────────────

// GET /api/messages
router.get('/messages', auth, async (req, res) => {
  const msgs = await Message.find({
    $or: [{ senderEmail: req.user.email }, { receiverEmail: req.user.email }]
  }).sort({ createdAt: 1 });
  res.json(msgs);
});

// POST /api/messages
router.post('/messages', auth, async (req, res) => {
  const { receiverEmail, content } = req.body;
  if (!receiverEmail || !content) return res.status(400).json({ error: 'receiver and content required.' });
  const msg = await Message.create({ senderEmail: req.user.email, receiverEmail, content, senderName: req.user.name });
  res.json(msg);
});

// ── ALERTS LOG ────────────────────────────────────────

// GET /api/alerts/log
router.get('/alerts/log', auth, adminOnly, async (req, res) => {
  const logs = await AlertLog.find().sort({ createdAt: -1 }).limit(100);
  res.json(logs);
});

// POST /api/alerts/send-all — send attendance + fee alerts to all relevant parents
router.post('/alerts/send-all', auth, adminOnly, async (req, res) => {
  const students = await Student.find();
  const sent = [];

  for (const stu of students) {
    // Attendance check
    const records = await Attendance.find({ studentId: stu.studentId });
    if (records.length > 0) {
      const pct = Math.round(records.filter(r => r.status === 'Present').length / records.length * 100);
      if (pct < 75) {
        const title = `⚠️ Attendance Alert — ${pct}%`;
        const msg   = `${stu.name}'s attendance is ${pct}%, below the required 75%.`;
        await Notification.create({ targetEmail: stu.parentEmail, type: 'danger', title, message: msg });
        const html = attendanceAlertEmail(stu.parentName || 'Parent', stu.name, pct);
        await sendMailToParent(stu.parentEmail, stu.parentPhone, title, html);
        await AlertLog.create({ recipient: stu.parentEmail, type: 'Email', subject: title, message: msg });
        sent.push({ student: stu.name, reason: 'Low Attendance', email: stu.parentEmail });
      }
    }
    // Fee check
    const fees = await Fee.find({ studentId: stu.studentId, status: { $in: ['Due', 'Overdue'] } });
    if (fees.length > 0) {
      const total = fees.reduce((s, f) => s + f.amount, 0);
      const title = `💰 Fee Payment Reminder`;
      const msg   = `Fee payment of ₹${total.toLocaleString('en-IN')} is pending for ${stu.name}. Please clear dues at the earliest.`;
      await Notification.create({ targetEmail: stu.parentEmail, type: 'warn', title, message: msg });
      await sendMailToParent(stu.parentEmail, stu.parentPhone, title, `<div style="font-family:sans-serif;padding:24px;background:#0a1628;color:#e8f0fe;border-radius:12px;"><h2 style="color:#f4c430">Fee Reminder</h2><p>${msg}</p></div>`);
      await AlertLog.create({ recipient: stu.parentEmail, type: 'Email', subject: title, message: msg });
      sent.push({ student: stu.name, reason: 'Fee Due', email: stu.parentEmail });
    }
  }
  res.json({ message: `${sent.length} alerts sent.`, sent });
});

// ── DASHBOARD STATS (Admin) ───────────────────────────
router.get('/dashboard/stats', auth, adminOnly, async (req, res) => {
  const [totalStudents, totalUsers, alertsSent] = await Promise.all([
    Student.countDocuments(),
    User.countDocuments({ role: 'parent' }),
    AlertLog.countDocuments(),
  ]);
  const fees = await Fee.find({ status: { $in: ['Due','Overdue'] } });
  const totalFeesDue = fees.reduce((s, f) => s + f.amount, 0);
  res.json({ totalStudents, totalParents: totalUsers, alertsSent, totalFeesDue });
});


// DELETE /api/students/:id — admin deletes a student
router.delete('/students/:id', auth, adminOnly, async (req, res) => {
  const student = await Student.findOneAndDelete({ studentId: req.params.id });
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  // Optionally, delete related records (marks, attendance, fees, etc.)
  await Promise.all([
    Attendance.deleteMany({ studentId: req.params.id }),
    Marks.deleteMany({ studentId: req.params.id }),
    Fee.deleteMany({ studentId: req.params.id }),
    Notification.deleteMany({ targetEmail: student.parentEmail }),
    Message.deleteMany({ $or: [ { senderEmail: student.parentEmail }, { receiverEmail: student.parentEmail } ] })
  ]);
  res.json({ message: 'Student deleted.' });
});

// ── PARENT PASSWORD SETUP ────────────────────────────

// GET /api/parents/pending-setup — admin gets parents who haven't set password
router.get('/parents/pending-setup', auth, adminOnly, async (req, res) => {
  const pendingParents = await User.find({ role: 'parent', passwordSet: false }).sort({ createdAt: -1 });
  const withStudents = await Promise.all(
    pendingParents.map(async (parent) => ({
      ...parent.toObject(),
      student: await Student.findOne({ studentId: parent.studentId })
    }))
  );
  res.json(withStudents);
});

// POST /api/parents/resend-setup/:email — admin resends setup email to parent
router.post('/parents/resend-setup/:email', auth, adminOnly, async (req, res) => {
  const { passwordSetupEmail, sendMailToParent } = require('../middleware/email');
  const email = decodeURIComponent(req.params.email).toLowerCase();
  const user = await User.findOne({ email, role: 'parent' });
  if (!user) return res.status(404).json({ error: 'Parent not found.' });
  const student = await Student.findOne({ studentId: user.studentId });
  if (!user.resetToken || new Date() > user.resetExpires) {
    const crypto = require('crypto');
    user.resetToken = crypto.randomBytes(32).toString('hex');
    user.resetExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();
  }
  const setupUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/set-password.html?token=${user.resetToken}`;
  const html = passwordSetupEmail(student?.parentName || user.name || 'Parent', email, student?.name || '', setupUrl);
  const sent = await sendMailToParent(email, student?.parentPhone, `Set Your Password — ${process.env.SCHOOL_NAME || 'EduConnect'}`, html);
  if (sent) {
    res.json({ message: 'Setup email resent successfully.', setupToken: user.resetToken, expiresAt: user.resetExpires });
  } else {
    res.status(500).json({ error: 'Failed to send email. Check EMAIL_USER and EMAIL_PASS in .env' });
  }
});

module.exports = router;

// POST /api/fees/add — admin adds/updates fee record
router.post('/fees/add', auth, adminOnly, async (req, res) => {
  const { studentId, term, amount, dueDate, paidDate, status } = req.body;
  if (!studentId || !term || !amount) return res.status(400).json({ error: 'studentId, term, amount required.' });
  // Ensure balance initialized to amount when creating new record
  const existing = await Fee.findOne({ studentId, term });
  if (existing) {
    existing.amount = amount;
    existing.dueDate = dueDate;
    existing.paidDate = paidDate || existing.paidDate;
    existing.status = status || existing.status;
    // if no balance present, initialize to amount; otherwise keep existing balance
    if (existing.balance == null) existing.balance = amount;
    await existing.save();
  } else {
    await Fee.create({ studentId, term, amount, balance: amount, dueDate, paidDate: paidDate || null, status: status || 'Pending' });
  }
  res.json({ message: 'Fee record saved.' });
});

// POST /api/fees/pay — parent or admin pays a fee (partial or full)
router.post('/fees/pay', auth, async (req, res) => {
  const { studentId, term, amount: paidAmount } = req.body;
  if (!studentId || !term || paidAmount == null) return res.status(400).json({ error: 'studentId, term, amount required.' });
  // Parents can only pay for their own child
  if (req.user.role === 'parent' && req.user.studentId !== studentId)
    return res.status(403).json({ error: 'Access denied.' });

  const fee = await Fee.findOne({ studentId, term });
  if (!fee) return res.status(404).json({ error: 'Fee record not found.' });

  // initialize balance if missing
  let balance = (fee.balance == null) ? fee.amount : fee.balance;
  balance = Math.max(0, balance - Number(paidAmount));
  fee.balance = balance;
  if (balance <= 0) {
    fee.status = 'Paid';
    fee.paidDate = new Date().toISOString().slice(0,10);
  } else {
    fee.status = 'Due';
  }
  await fee.save();

  // Log a notification for parent
  await Notification.create({ targetEmail: req.user.email, type: 'success', title: 'Payment Received', message: `Payment of ₹${Number(paidAmount).toLocaleString('en-IN')} received for ${term}. Thank you.` });

  // Create a payment record and generate receipt + email
  try {
    const transactionId = `TXN_${Date.now()}`;
    const payment = await Payment.create({
      studentId,
      feeId: fee._id,
      amount: Number(paidAmount),
      status: 'success',
      transactionId,
      paymentDate: new Date(),
      email: req.user.email,
      notes: `Manual payment for ${term}`,
    });

    // Generate receipt PDF
    try {
      const student = await Student.findOne({ studentId });
      const receiptData = await generateReceiptPDF({
        transactionId,
        studentId,
        studentName: student?.name || 'N/A',
        class: student?.class || 'N/A',
        term: fee.term,
        feeType: 'Tuition Fee',
        amount: Number(paidAmount),
        paymentMethod: 'Manual',
        paymentDate: new Date(),
        dueDate: fee.dueDate,
        status: 'success',
      });
      if (receiptData && receiptData.url) {
        payment.receiptUrl = receiptData.url;
        await payment.save();
      }

      // Send email to parent with receipt
      try {
        await sendMailToParentWithOptions(student?.parentEmail || req.user.email, {
          studentName: student?.name,
          parentName: student?.parentName,
          amount: Number(paidAmount).toFixed(2),
          transactionId,
          term: fee.term,
          paymentDate: new Date().toLocaleDateString('en-IN'),
          subject: 'Fee Payment Successful',
        });
      } catch (emailErr) {
        console.error('Failed sending payment email:', emailErr);
      }
    } catch (pdfErr) {
      console.error('Receipt generation failed:', pdfErr);
    }
  } catch (recErr) {
    console.error('Failed to create payment record:', recErr);
  }

  res.json({ message: 'Payment recorded.', fee });
});
