const AuditLog = require('../models/AuditLog');

async function list(req, res) {
  const { search, user, action, entity, from, to } = req.query;
  const query = {};
  if (user) query.userName = new RegExp(user, 'i');
  if (action) query.action = new RegExp(action, 'i');
  if (entity) query.entity = entity;
  if (from || to) {
    query.timestamp = {};
    if (from) query.timestamp.$gte = new Date(from);
    if (to) query.timestamp.$lte = new Date(`${to}T23:59:59`);
  }
  if (search) {
    query.$or = [
      { userName: new RegExp(search, 'i') },
      { action: new RegExp(search, 'i') },
      { entityLabel: new RegExp(search, 'i') },
      { entityId: new RegExp(search, 'i') },
    ];
  }
  res.json(await AuditLog.find(query).sort({ timestamp: -1 }).limit(500).lean());
}

module.exports = { list };
