const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { User, Student } = require('../models');
const { sendMail } = require('../middleware/email');
const { auth } = require('../middleware/auth');

const FRONTEND_URL = process.env.FRONTEND_URL;
const SCHOOL_STAFF_DOMAIN = '@school.edu.in';
const DEFAULT_STAFF_PASSWORD = 'Welcome@123';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeStaffLoginEmail(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const lowered = raw.toLowerCase();
  if (lowered.includes('@')) {
    const [localPart, domain = ''] = lowered.split('@');
    if (!localPart) return '';
    if (domain === 'school.edu.in') return `${localPart.replace(/\s+/g, '')}@school.edu.in`;
    return `${localPart.replace(/\s+/g, '')}@school.edu.in`;
  }

  return `${lowered.replace(/\s+/g, '')}@school.edu.in`;
}

function isValidSchoolStaffEmail(email) {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@school\.edu\.in$/i.test(normalized);
}

function getFrontendUrl(req) {
  return FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
}

function buildJwtPayload(user) {
  return { id: user._id, email: user.email, role: user.role, studentId: user.studentId, name: user.name };
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password, selectedRole } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });

  const normalizedRole = selectedRole === 'parent' || selectedRole === 'student' ? 'parent' : 'admin';
  const candidateEmails = new Set();

  const directEmail = normalizeEmail(email);
  if (directEmail) candidateEmails.add(directEmail);

  if (normalizedRole === 'admin') {
    const staffEmail = normalizeStaffLoginEmail(email);
    if (staffEmail) candidateEmails.add(staffEmail);
  }

  const user = await User.findOne({ email: { $in: Array.from(candidateEmails) } });
  if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

  const allowedRoles = normalizedRole === 'parent' ? ['parent'] : ['admin'];

  if (!allowedRoles.includes(user.role)) {
    return res.status(403).json({
      error: normalizedRole === 'parent'
        ? 'This account is not authorized to sign in to the parent portal.'
        : 'This account is not authorized to sign in to the staff portal.',
    });
  }

  if (user.role === 'admin' && !isValidSchoolStaffEmail(user.email) && user.email !== 'admin@school.edu') {
    return res.status(403).json({ error: 'This staff account is not authorized for this school domain.' });
  }

  if (user.role === 'parent' && !user.passwordSet) {
    return res.status(403).json({
      error: 'Please set your password using the link in your welcome email before signing in.',
    });
  }

  let studentInfo = null;
  if (user.studentId) {
    studentInfo = await Student.findOne({ studentId: user.studentId });
  }

  const token = jwt.sign(buildJwtPayload(user), process.env.JWT_SECRET, { expiresIn: '10h' });

  const safeUser = {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId,
    passwordSet: user.passwordSet,
    mustChangePassword: !!user.mustChangePassword,
  };

  if (user.mustChangePassword) {
    return res.json({
      token,
      user: safeUser,
      student: studentInfo,
      mustChangePassword: true,
      message: 'Password change required for first-time staff login.',
    });
  }

  res.json({
    token,
    user: safeUser,
    student: studentInfo,
    mustChangePassword: false,
  });
});

// POST /api/auth/set-password  — parent sets their own password using token from email
router.post('/set-password', async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const user = await User.findOne({ resetToken: token, resetExpires: { $gt: new Date() } });
  if (!user) return res.status(400).json({ error: 'Invalid or expired setup link. Contact admin.' });

  user.password    = await bcrypt.hash(newPassword, 10);
  user.passwordSet = true;
  user.mustChangePassword = false;
  user.resetToken  = undefined;
  user.resetExpires = undefined;
  await user.save();

  res.json({ message: 'Password set successfully. You can now log in.' });
});

// POST /api/auth/first-login-set-password — staff must change temp password after valid login
router.post('/first-login-set-password', auth, async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ error: 'New password required.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const user = await User.findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  if (!user.mustChangePassword && user.role !== 'admin') {
    return res.status(400).json({ error: 'This account does not require a password reset.' });
  }

  if (user.role === 'admin' && !isValidSchoolStaffEmail(user.email) && user.email !== 'admin@school.edu') {
    return res.status(403).json({ error: 'This staff account is not approved for the school email domain.' });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  user.passwordSet = true;
  user.mustChangePassword = false;
  user.resetToken = undefined;
  user.resetExpires = undefined;
  await user.save();

  res.json({
    message: 'Password updated successfully. Redirecting to the staff dashboard.',
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
});

// POST /api/auth/forgot-password — send reset link
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: email?.toLowerCase() });
  if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' }); // don't reveal

  const token = crypto.randomBytes(32).toString('hex');
  user.resetToken   = token;
  user.resetExpires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
  await user.save();

  const link = `${getFrontendUrl(req)}/set-password.html?token=${token}`;
  await sendMail(user.email, 'Reset your EduConnect password',
    `<div style="font-family:sans-serif;padding:32px;background:#0a1628;color:#e8f0fe;border-radius:12px;">
      <h2 style="color:#00c9a7">Password Reset</h2>
      <p>Click below to reset your EduConnect password. This link expires in 2 hours.</p>
      <a href="${link}" style="display:inline-block;background:#00c9a7;color:#0a1628;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;margin-top:16px;">Reset Password</a>
    </div>`
  );
  res.json({ message: 'Reset link sent to your email.' });
});

// POST /api/auth/change-password — authenticated user changes own password
router.post('/change-password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Both fields required.' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const user = await User.findById(req.user.id);
  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

  user.password = await bcrypt.hash(newPassword, 10);
  user.passwordSet = true;
  user.mustChangePassword = false;
  await user.save();
  res.json({ message: 'Password changed successfully.' });
});

module.exports = router;
module.exports.normalizeEmail = normalizeEmail;
module.exports.normalizeStaffLoginEmail = normalizeStaffLoginEmail;
module.exports.isValidSchoolStaffEmail = isValidSchoolStaffEmail;
module.exports.DEFAULT_STAFF_PASSWORD = DEFAULT_STAFF_PASSWORD;
module.exports.SCHOOL_STAFF_DOMAIN = SCHOOL_STAFF_DOMAIN;
