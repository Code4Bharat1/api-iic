const Notification = require('../models/Notification');

async function listNotifications(user) {
  const notifications = await Notification.find({
    $or: [{ targetUserId: user.userId }, { targetRole: user.role }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  return notifications;
}

async function markRead(id, user) {
  const notification = await Notification.findById(id);
  if (!notification) throw Object.assign(new Error('Notification not found'), { status: 404 });
  
  if (notification.targetUserId !== user.userId && notification.targetRole !== user.role) {
    throw Object.assign(new Error('You cannot read this notification.'), { status: 403 });
  }

  notification.read = true;
  await notification.save();
  return notification;
}

async function markAllRead(user) {
  await Notification.updateMany(
    { $or: [{ targetUserId: user.userId }, { targetRole: user.role }], read: false },
    { read: true }
  );
  return { ok: true };
}

module.exports = { listNotifications, markRead, markAllRead };
