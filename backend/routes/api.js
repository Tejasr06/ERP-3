const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { spawnSync } = require('child_process');
const router = require('express').Router();
const { Student, Attendance, Marks, Fee, Notification, Message, AlertLog, User, Payment, FaceEmbedding } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');
const { sendMail, sendMailToParent, sendMailToParentWithOptions, notificationEmail, attendanceAlertEmail } = require('../middleware/email');
const { generateReceiptPDF } = require('../utils/pdfGenerator');
const { resolvePythonExecutable } = require('../utils/pythonCommand');

function decodeDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp|bmp));base64,(.*)$/i);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[3], 'base64') };
}

function runPythonFaceScript(args) {
  const python = resolvePythonExecutable();
  const commandArgs = python.args.concat([path.join(__dirname, '../face_recognition_service.py'), ...args]);
  const result = spawnSync(python.cmd, commandArgs, {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  if (result.error) {
    throw result.error;
  }

  let payload = null;
  try {
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const parsed = JSON.parse(lines[i]);
        if (parsed && typeof parsed === 'object') {
          payload = parsed;
          break;
        }
      } catch {}
    }
  } catch {
    payload = null;
  }

  if (!payload || payload.ok === false) {
    const message = payload?.message || payload?.error || stderr || stdout || 'Python face recognition failed.';
    throw new Error(message);
  }

  return payload;
}

async function getKnownFaceEncodings() {
  const records = await FaceEmbedding.find({}).select('studentId name encodings sampleCount registrationDate').lean();
  return records
    .filter(record => record.studentId && Array.isArray(record.encodings) && record.encodings.length)
    .map(record => ({
      studentId: record.studentId,
      name: record.name || '',
      encodings: record.encodings,
      registrationDate: record.registrationDate || null,
    }));
}

async function saveStudentFaceEncodings(studentId, name, encodings, sampleCount) {
  return FaceEmbedding.findOneAndUpdate(
    { studentId },
    {
      studentId,
      name: name || 'Unknown',
      encodings: Array.isArray(encodings) ? encodings : [],
      sampleCount: Number(sampleCount) || 0,
      registrationDate: new Date(),
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
}

async function markAttendanceRecord({ studentId, date, className, section, period, subject, status, markedBy }) {
  const normalized = {
    studentId,
    date,
    class: className,
    section,
    period: Number(period) || 0,
    subject: subject || 'All',
    status,
    markedBy: markedBy || 'Face Recognition',
  };

  const existing = await Attendance.findOne({
    studentId: normalized.studentId,
    date: normalized.date,
    period: normalized.period,
    subject: normalized.subject,
  }).lean();

  if (existing) {
    if (existing.status === 'Present' && normalized.status === 'Present') {
      return { upserted: false, duplicate: true, record: existing };
    }
    const updated = await Attendance.findOneAndUpdate(
      { studentId: normalized.studentId, date: normalized.date, period: normalized.period, subject: normalized.subject },
      { $set: { ...normalized, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    return { upserted: false, duplicate: false, record: updated };
  }

  const created = await Attendance.create({ ...normalized, createdAt: new Date(), updatedAt: new Date() });
  return { upserted: true, duplicate: false, record: created };
}

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

// GET /api/attendance — query attendance records by filters
router.get('/attendance', auth, async (req, res) => {
  const q = {};
  // allow queries: studentId, date, class, section, period, subject
  if (req.query.studentId) {
    if (req.user.role === 'parent' && req.user.studentId !== req.query.studentId)
      return res.status(403).json({ error: 'Access denied.' });
    q.studentId = req.query.studentId;
  }
  if (req.query.date) q.date = req.query.date;
  if (req.query.class) q.class = req.query.class;
  if (req.query.section) q.section = req.query.section;
  if (req.query.period) q.period = Number(req.query.period);
  if (req.query.subject) q.subject = req.query.subject;

  const records = await Attendance.find(q).sort({ date: -1, period: 1 });
  // Hour-based (period) summary
  const totalHours = records.length;
  const presentHours = records.filter(r => r.status === 'Present').length;
  const absentHours = records.filter(r => r.status === 'Absent').length;
  const hoursPct = totalHours > 0 ? Math.round((presentHours / totalHours) * 100) : 0;

  // Day-based summary: count unique dates and mark day present if any period present
  const byDate = {};
  records.forEach(r => {
    byDate[r.date] = byDate[r.date] || [];
    byDate[r.date].push(r);
  });
  const dates = Object.keys(byDate).sort((a,b)=>new Date(b)-new Date(a));
  const totalDays = dates.length;
  let presentDays = 0, absentDays = 0;
  dates.forEach(d => {
    const recs = byDate[d];
    // If there are per-period records (period > 0) for this date, ignore period 0 legacy records
    const hasPeriods = recs.some(x => x.period && Number(x.period) > 0);
    const recsFiltered = hasPeriods ? recs.filter(x => Number(x.period) > 0) : recs;
    if (recsFiltered.some(x => x.status === 'Present')) presentDays++;
    else if (recsFiltered.length > 0 && recsFiltered.every(x => x.status === 'Absent')) absentDays++;
  });
  const daysPct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  // For backward compatibility, top-level summary remains day-based
  res.json({
    records,
    summary: {
      // day-level
      total: totalDays,
      present: presentDays,
      absent: absentDays,
      percentage: daysPct,
      // hour-level nested
      hours: { total: totalHours, present: presentHours, absent: absentHours, percentage: hoursPct }
    }
  });
});

// GET /api/attendance/:studentId — legacy endpoint (summary across all records)
router.get('/attendance/:studentId', auth, async (req, res) => {
  // Parents can only see their own child
  if (req.user.role === 'parent' && req.user.studentId !== req.params.studentId)
    return res.status(403).json({ error: 'Access denied.' });

  const records = await Attendance.find({ studentId: req.params.studentId }).sort({ date: -1, period: 1 });
  // Hour-based summary
  const totalHours = records.length;
  const presentHours = records.filter(r => r.status === 'Present').length;
  const absentHours = records.filter(r => r.status === 'Absent').length;
  const hoursPct = totalHours > 0 ? Math.round((presentHours / totalHours) * 100) : 0;

  // Day-based summary
  const byDate = {};
  records.forEach(r => { byDate[r.date] = byDate[r.date] || []; byDate[r.date].push(r); });
  const dates = Object.keys(byDate).sort((a,b)=>new Date(b)-new Date(a));
  const totalDays = dates.length;
  let presentDays = 0, absentDays = 0;
  dates.forEach(d => {
    const recs = byDate[d];
    const hasPeriods = recs.some(x => x.period && Number(x.period) > 0);
    const recsFiltered = hasPeriods ? recs.filter(x => Number(x.period) > 0) : recs;
    if (recsFiltered.some(x => x.status === 'Present')) presentDays++;
    else if (recsFiltered.length > 0 && recsFiltered.every(x => x.status === 'Absent')) absentDays++;
  });
  const daysPct = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

  res.json({
    records,
    summary: {
      total: totalDays,
      present: presentDays,
      absent: absentDays,
      percentage: daysPct,
      hours: { total: totalHours, present: presentHours, absent: absentHours, percentage: hoursPct }
    }
  });
});

// POST /api/attendance — admin adds records
router.post('/attendance', auth, adminOnly, async (req, res) => {
  const { records, markedBy } = req.body;
  if (!Array.isArray(records)) return res.status(400).json({ error: 'records[] required.' });

  // Validate input fields
  for (const r of records) {
    if (!r.studentId) return res.status(400).json({ error: 'studentId required for each record.' });
    if (!r.date) return res.status(400).json({ error: 'date required for each record.' });
    if (!r.period && r.period !== 0 && r.period !== '0') return res.status(400).json({ error: 'period required for each record.' });
    if (!r.class) return res.status(400).json({ error: 'class required for each record.' });
    if (!r.section) return res.status(400).json({ error: 'section required for each record.' });
    if (!r.subject) return res.status(400).json({ error: 'subject required for each record.' });
    if (!r.status) return res.status(400).json({ error: 'status required for each record.' });
  }

  const operations = records.map(record => {
    const normalizedRecord = {
      studentId: record.studentId,
      date: record.date,
      class: record.class,
      section: record.section,
      period: Number(record.period) || 0,
      subject: record.subject || 'All',
      status: record.status,
      markedBy: markedBy || req.user.email || req.user.name || '',
      updatedAt: new Date(),
    };

    return {
      updateOne: {
        filter: {
          studentId: normalizedRecord.studentId,
          date: normalizedRecord.date,
          period: normalizedRecord.period,
          subject: normalizedRecord.subject,
        },
        update: {
          $set: normalizedRecord,
          $setOnInsert: { createdAt: new Date() }
        },
        upsert: true,
      },
    };
  });

  if (operations.length) {
    await Attendance.bulkWrite(operations);
  }

  const studentIds = [...new Set(records.map(r => r.studentId))];
  for (const sid of studentIds) await checkAttendanceAlert(sid);
  res.json({ message: `${records.length} attendance records saved or updated.` });
});

async function checkAttendanceAlert(studentId) {
  const records = await Attendance.find({ studentId });
  if (!records.length) return;
  // Only consider marked periods: if a date has period>0 records, ignore any period=0 legacy records for that date
  const byDate = {};
  records.forEach(r => { byDate[r.date] = byDate[r.date] || []; byDate[r.date].push(r); });
  const considered = [];
  Object.keys(byDate).forEach(d => {
    const recs = byDate[d];
    const hasPeriods = recs.some(x => x.period && Number(x.period) > 0);
    const recsFiltered = hasPeriods ? recs.filter(x => Number(x.period) > 0) : recs;
    recsFiltered.forEach(r => considered.push(r));
  });
  const pct = considered.length ? Math.round(considered.filter(r => r.status === 'Present').length / considered.length * 100) : 0;
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

// ── FACE RECOGNITION ───────────────────────────────────
router.get('/face/students', auth, adminOnly, async (req, res) => {
  const students = await Student.find().select('studentId name class section').sort({ name: 1 });
  res.json(students);
});

router.get('/face/registered', auth, adminOnly, async (req, res) => {
  try {
    const records = await FaceEmbedding.find({}).select('studentId name sampleCount registrationDate').sort({ studentId: 1 }).lean();
    res.json(records.map(record => ({
      studentId: record.studentId,
      name: record.name || '',
      sampleCount: Number(record.sampleCount) || 0,
      registrationDate: record.registrationDate || null,
    })));
  } catch (error) {
    console.error('Failed to load registered faces:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Failed to load registered faces.' });
  }
});

router.post('/face/register', auth, adminOnly, async (req, res) => {
  const { studentId, samples } = req.body || {};
  if (!studentId) return res.status(400).json({ error: 'studentId required.' });
  if (!Array.isArray(samples) || samples.length < 3 || samples.length > 5) {
    return res.status(400).json({ error: 'Provide 3 to 5 face samples.' });
  }

  for (const sample of samples) {
    if (typeof sample !== 'string' || !sample.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Each face sample must be a valid image data URL.' });
    }
  }

  const student = await Student.findOne({ studentId });
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-face-register-'));

  try {
    for (let i = 0; i < samples.length; i += 1) {
      const sample = decodeDataUrl(samples[i]);
      if (!sample) return res.status(400).json({ error: 'Invalid image sample provided.' });
      const filePath = path.join(tempDir, `sample_${i + 1}.png`);
      fs.writeFileSync(filePath, sample.buffer);
    }

    const validation = runPythonFaceScript(['--validate-samples', '--student-dir', tempDir]);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message || 'Face samples were not valid.' });
    }

    const encoded = runPythonFaceScript(['--encode-samples', '--student-dir', tempDir]);
    const saved = await saveStudentFaceEncodings(studentId, student.name, encoded.encodings || [], encoded.sampleCount || samples.length);

    res.json({
      message: `Face registration saved for ${student.name} (${studentId}).`,
      studentId,
      sampleCount: saved.sampleCount,
      name: saved.name,
      registrationDate: saved.registrationDate,
    });
  } catch (error) {
    const message = error?.message || 'Unable to validate face samples.';
    if (message.toLowerCase().includes('mongodb') || message.toLowerCase().includes('database')) {
      return res.status(503).json({ error: message });
    }
    return res.status(400).json({ error: message });
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

router.post('/face/recognize', auth, adminOnly, async (req, res) => {
  const { image, date, className, section, period, subject, status } = req.body || {};
  if (!image) return res.status(400).json({ error: 'Image data is required.' });

  const selectedDate = date || new Date().toISOString().slice(0, 10);
  const selectedClass = className || req.body.class || '';
  const selectedSection = section || req.body.section || '';
  const selectedPeriod = Number(period || req.body.period || 0);
  const selectedSubject = subject || req.body.subject || 'All';
  const selectedStatus = status || 'Present';

  const decoded = decodeDataUrl(image);
  if (!decoded) return res.status(400).json({ error: 'Invalid image payload.' });

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-face-recognize-'));
  const tempImagePath = path.join(tempDir, 'snapshot.png');

  try {
    fs.writeFileSync(tempImagePath, decoded.buffer);

    const knownStudents = await getKnownFaceEncodings();
    const knownEncodingsPath = path.join(tempDir, 'known_encodings.json');
    fs.writeFileSync(knownEncodingsPath, JSON.stringify(knownStudents || []), 'utf8');

    const result = runPythonFaceScript(['--recognize', '--image', tempImagePath, '--known-encodings-file', knownEncodingsPath]);

    const faces = Array.isArray(result.faces) ? result.faces : [];
    const imageWidth = result.imageWidth || 640;
    const imageHeight = result.imageHeight || 480;

    if (!faces.length) {
      return res.json({
        ok: true,
        recognized: false,
        faceCount: 0,
        faces: [],
        imageWidth,
        imageHeight,
        message: 'No face detected in camera.',
      });
    }

    const hasFilters = Boolean(selectedClass && selectedSection && selectedPeriod && selectedSubject);
    const enrichedFaces = [];
    const markedStudents = [];

    for (const face of faces) {
      const faceInfo = {
        box: face.box,
        recognized: Boolean(face.recognized && face.studentId),
        studentId: face.studentId || null,
        studentName: 'Unknown',
        confidence: face.confidence || 0,
        distance: face.distance || 1.0,
        duplicate: false,
        attendanceMarked: false,
        message: 'Unknown face',
      };

      if (faceInfo.recognized) {
        const student = await Student.findOne({ studentId: face.studentId }).lean();
        if (student) {
          faceInfo.studentName = student.name;
          faceInfo.studentClass = student.class;
          faceInfo.studentSection = student.section;

          if (hasFilters) {
            try {
              const recordResult = await markAttendanceRecord({
                studentId: student.studentId,
                date: selectedDate,
                className: selectedClass,
                section: selectedSection,
                period: selectedPeriod,
                subject: selectedSubject,
                status: selectedStatus,
                markedBy: 'Face Recognition',
              });
              faceInfo.attendanceMarked = true;
              faceInfo.duplicate = Boolean(recordResult.duplicate);
              faceInfo.message = recordResult.duplicate
                ? 'Attendance already recorded for this period'
                : `${student.name} marked ${selectedStatus}`;

              markedStudents.push({
                studentId: student.studentId,
                studentName: student.name,
                duplicate: recordResult.duplicate,
                status: selectedStatus,
                time: new Date().toLocaleTimeString(),
              });
            } catch (attErr) {
              faceInfo.attendanceMarked = false;
              faceInfo.message = attErr.message || 'Failed to record attendance';
            }
          } else {
            faceInfo.attendanceMarked = false;
            faceInfo.message = 'Filters missing (Select class/section/period)';
          }
        } else {
          faceInfo.recognized = false;
          faceInfo.studentName = 'Unknown';
          faceInfo.message = 'Face registered, but student profile not found in database.';
        }
      }

      enrichedFaces.push(faceInfo);
    }

    const anyRecognized = enrichedFaces.some(f => f.recognized);
    const primaryFace = enrichedFaces.find(f => f.recognized) || enrichedFaces[0];

    return res.json({
      ok: true,
      recognized: anyRecognized,
      faceCount: enrichedFaces.length,
      faces: enrichedFaces,
      imageWidth,
      imageHeight,
      markedStudents,
      studentId: primaryFace?.studentId || null,
      studentName: primaryFace?.studentName || (anyRecognized ? 'Recognized' : 'Unknown face'),
      duplicate: enrichedFaces.some(f => f.duplicate),
      confidence: primaryFace?.confidence || 0,
      message: anyRecognized
        ? enrichedFaces.filter(f => f.recognized).map(f => `${f.studentName} (${f.studentId})`).join(', ') + ' recognized'
        : 'Unknown face detected. No attendance marked.',
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Face recognition failed.' });
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

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
    { upsert: true, returnDocument: 'after' }
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
  const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
  const setupUrl = `${frontendUrl}/set-password.html?token=${user.resetToken}`;
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
