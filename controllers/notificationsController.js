const Notification = require('../models/Notification');

async function list(req, res) {
  const notifications = await Notification.find({
    $or: [{ targetUserId: req.user.userId }, { targetRole: req.user.role }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json(notifications);
}

async function markRead(req, res) {
  const notification = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
  res.json(notification);
}

async function markAllRead(req, res) {
  await Notification.updateMany(
    { $or: [{ targetUserId: req.user.userId }, { targetRole: req.user.role }], read: false },
    { read: true }
  );
  res.json({ ok: true });
}

module.exports = { list, markRead, markAllRead };
