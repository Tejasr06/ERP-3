// GET/POST /api/notifications — In-app notification routes
const router = require('express').Router();
const { Notification } = require('../models');
const { auth } = require('../middleware/auth');

// GET /api/notifications — fetch notifications for logged-in user
router.get('/notifications', auth, async (req, res) => {
  try {
    const notifs = await Notification.find({ targetEmail: req.user.email })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(notifs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// POST /api/notifications/mark-all-read
router.post('/notifications/mark-all-read', auth, async (req, res) => {
  try {
    await Notification.updateMany({ targetEmail: req.user.email, isRead: false }, { $set: { isRead: true } });
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notifications.' });
  }
});

// POST /api/notifications/:id/read — mark single notification read
router.post('/notifications/:id/read', auth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

module.exports = router;
