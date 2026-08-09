const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Achievement, Student } = require('../models');
const { auth, adminOnly } = require('../middleware/auth');

const uploadDir = path.join(__dirname, '../uploads/achievements');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${base}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

router.get('/achievements', async (req, res) => {
  const { category, search, limit } = req.query;
  const filter = {};
  if (category) filter.category = category;
  if (search) filter.studentName = new RegExp(search, 'i');
  const query = Achievement.find(filter).sort({ achievementDate: -1, createdAt: -1 });
  const parsedLimit = Number(limit);
  if (Number.isInteger(parsedLimit) && parsedLimit > 0) query.limit(parsedLimit);
  const achievements = await query;
  res.json(achievements);
});

router.post('/achievements', auth, adminOnly, upload.fields([
  { name: 'studentPhoto', maxCount: 1 },
  { name: 'certificate', maxCount: 1 }
]), async (req, res) => {
  try {
    const { studentId, studentName, title, description, category, achievementDate, position, badge } = req.body;
    if (!studentId || !studentName || !title || !category || !achievementDate) {
      return res.status(400).json({ error: 'studentId, studentName, title, category and achievementDate are required.' });
    }

    const student = await Student.findOne({ studentId });
    const achievement = await Achievement.create({
      studentId,
      studentName,
      title,
      description: description || '',
      category,
      achievementDate,
      position: position || '',
      badge: badge || '',
      studentPhoto: req.files?.studentPhoto?.[0] ? `/uploads/achievements/${req.files.studentPhoto[0].filename}` : (student?.photo || ''),
      certificate: req.files?.certificate?.[0] ? `/uploads/achievements/${req.files.certificate[0].filename}` : '',
      certificateName: req.files?.certificate?.[0]?.originalname || '',
      certificateType: req.files?.certificate?.[0]?.mimetype || ''
    });

    res.json({ message: 'Achievement added.', achievement });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to add achievement.' });
  }
});

router.put('/achievements/:id', auth, adminOnly, upload.fields([
  { name: 'studentPhoto', maxCount: 1 },
  { name: 'certificate', maxCount: 1 }
]), async (req, res) => {
  try {
    const achievement = await Achievement.findById(req.params.id);
    if (!achievement) return res.status(404).json({ error: 'Achievement not found.' });

    const { studentId, studentName, title, description, category, achievementDate, position, badge } = req.body;
    Object.assign(achievement, {
      studentId: studentId || achievement.studentId,
      studentName: studentName || achievement.studentName,
      title: title || achievement.title,
      description: description ?? achievement.description,
      category: category || achievement.category,
      achievementDate: achievementDate || achievement.achievementDate,
      position: position ?? achievement.position,
      badge: badge ?? achievement.badge,
    });

    if (req.files?.studentPhoto?.[0]) {
      achievement.studentPhoto = `/uploads/achievements/${req.files.studentPhoto[0].filename}`;
    }

    if (req.files?.certificate?.[0]) {
      achievement.certificate = `/uploads/achievements/${req.files.certificate[0].filename}`;
      achievement.certificateName = req.files.certificate[0].originalname;
      achievement.certificateType = req.files.certificate[0].mimetype;
    }

    await achievement.save();
    res.json({ message: 'Achievement updated.', achievement });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update achievement.' });
  }
});

router.delete('/achievements/:id', auth, adminOnly, async (req, res) => {
  const achievement = await Achievement.findByIdAndDelete(req.params.id);
  if (!achievement) return res.status(404).json({ error: 'Achievement not found.' });
  res.json({ message: 'Achievement deleted.' });
});

module.exports = router;
