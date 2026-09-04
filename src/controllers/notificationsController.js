const notificationService = require('../services/notification.service');

async function list(req, res) {
  const notifications = await notificationService.listNotifications(req.user);
  res.json(notifications);
}

async function markRead(req, res) {
  const notification = await notificationService.markRead(req.params.id, req.user);
  res.json(notification);
}

async function markAllRead(req, res) {
  const result = await notificationService.markAllRead(req.user);
  res.json(result);
}

module.exports = { list, markRead, markAllRead };
