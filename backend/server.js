// ╔══════════════════════════════════════════════════════════╗
// ║   EduConnect — Backend Server (Enhanced Fee Module)      ║
// ║   node server.js  |  PORT default: 3000                 ║
// ╚══════════════════════════════════════════════════════════╝
require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');
const path      = require('path');
const fs        = require('fs');
const bcrypt    = require('bcryptjs');
const dns       = require('dns');
const { Payment, Fee, Student } = require('./models');
const { generateReceiptPDF } = require('./utils/pdfGenerator');

const app  = express();
const PORT = process.env.PORT || 3000;

dns.setServers(['8.8.8.8', '1.1.1.1']);
process.on('unhandledRejection', err => console.error('Unhandled rejection:', err?.message || err));

// ── Middleware ────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, './uploads')));

app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Upload payload too large. Please reduce the image size or try fewer samples.' });
  }
  next(err);
});

// Serve generated receipt PDFs
app.get('/api/receipts/:receiptId', async (req, res, next) => {
  try {
    const requestedFile = path.basename(req.params.receiptId || '');
    const filePath = path.join(__dirname, './uploads', requestedFile);
    const receiptMatch = requestedFile.match(/^receipt_(TXN_\d+)_(\d+)\.pdf$/);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    if (!receiptMatch) return next();

    const transactionId = receiptMatch[1];
    const payment = await Payment.findOne({ transactionId }).populate({ path: 'feeId', populate: { path: 'feeStructureId' } });
    if (!payment) return next();

    const student = await Student.findOne({ studentId: payment.studentId });
    const fee = payment.feeId;
    await generateReceiptPDF({
      transactionId:     payment.transactionId,
      studentId:         payment.studentId,
      studentName:       student?.name || 'N/A',
      class:             student?.class || 'N/A',
      section:           student?.section || 'N/A',
      parentName:        student?.parentName || 'Parent',
      term:              fee?.term || '—',
      feeType:           fee?.feeType || fee?.feeStructureId?.feeType || 'Tuition Fee',
      amount:            payment.amount,
      paymentMethod:     payment.paymentMethod || 'Card',
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayOrderId:   payment.razorpayOrderId,
      paymentDate:       payment.paymentDate || new Date(),
      dueDate:           fee?.dueDate,
      status:            payment.status || 'success',
      schoolName:        process.env.SCHOOL_NAME || 'EduConnect School',
      schoolAddress:     process.env.SCHOOL_ADDRESS || '',
      schoolPhone:       process.env.SCHOOL_PHONE || '',
      fileName:          requestedFile,
    });

    return res.download(filePath);
  } catch (err) {
    console.error('Receipt regeneration failed:', err.message || err);
    return next();
  }
});
app.use('/api/receipts', express.static(path.join(__dirname, './uploads')));

// ── MongoDB ───────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/educonnect')
  .then(() => {
    console.log('✅ MongoDB connected');
    seedAdmin().catch(err => console.error('⚠️  Admin seed failed:', err.message));
    seedAuthorizedStaffAccounts().catch(err => console.error('⚠️  Staff seed failed:', err.message));
  })
  .catch(err => console.error('❌ MongoDB error:', err.message));

// ── Routes ────────────────────────────────────────────
app.use('/api/auth',          require('./routes/auth'));
app.use('/api',               require('./routes/fees'));          // Before api.js (has /fees/:studentId)
app.use('/api',               require('./routes/api'));
app.use('/api',               require('./routes/notifications')); // In-app notifications
app.use('/api',               require('./routes/achievements'));
app.use('/api/import',        require('./routes/import'));

// ── Frontend pages ────────────────────────────────────
app.get('/',              (_, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/dashboard',     (_, res) => res.sendFile(path.join(__dirname, '../frontend/dashboard.html')));
app.get('/admin',         (_, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));
app.get('/achievement-wall.html', (_, res) => res.sendFile(path.join(__dirname, '../frontend/achievement-wall.html')));
app.get('/achievement-wall', (_, res) => res.redirect('/achievement-wall.html'));
app.get('/fees',          (_, res) => res.sendFile(path.join(__dirname, '../frontend/fees.html')));
app.get('/admin/fees',    (_, res) => res.sendFile(path.join(__dirname, '../frontend/admin-fees.html')));
app.get('/set-password.html', (_, res) => res.sendFile(path.join(__dirname, '../frontend/set-password.html')));

// ── 404 ───────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// ── Seed admin ────────────────────────────────────────
async function seedAdmin() {
  if (mongoose.connection.readyState !== 1) return;
  const { User } = require('./models');
  const exists = await User.findOne({ role: 'admin' });
  if (!exists) {
    const hashed = await bcrypt.hash('Admin@123', 10);
    await User.create({ email: 'admin@school.edu.in', password: hashed, role: 'admin', name: 'School Admin', passwordSet: true, mustChangePassword: true });
    console.log('✅ Admin created: admin@school.edu.in / Admin@123');
    console.log('   ⚠️  Change password after first login!');
  }
}

async function seedAuthorizedStaffAccounts() {
  if (mongoose.connection.readyState !== 1) return;
  const { User } = require('./models');
  const demoStaff = [
    { name: 'Rahul Kumar', email: 'rahul@school.edu.in' },
    { name: 'Priya Nair', email: 'priya@school.edu.in' },
    { name: 'Arun Sharma', email: 'arun@school.edu.in' },
  ];

  for (const staff of demoStaff) {
    const existing = await User.findOne({ email: staff.email.toLowerCase() });
    if (!existing) {
      const hashed = await bcrypt.hash('Welcome@123', 10);
      await User.create({
        name: staff.name,
        email: staff.email.toLowerCase(),
        password: hashed,
        role: 'admin',
        passwordSet: true,
        mustChangePassword: true,
      });
      console.log(`✅ Demo staff created: ${staff.email} / Welcome@123`);
    }
  }
}

const server = app.listen(PORT, () => {
  console.log(`\n🚀 EduConnect running → http://localhost:${PORT}`);
  console.log(`📁 API Base          → http://localhost:${PORT}/api`);
  console.log(`💳 Razorpay Key Set  → ${!!process.env.RAZORPAY_KEY_ID}`);
});
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Stop the other process or set PORT in .env`);
    process.exit(1);
  }
  throw err;
});
