const AuditLog = require('../models/AuditLog');

async function listAuditLogs(queryOptions) {
  const { search, user, action, entity, from, to } = queryOptions;
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
  return await AuditLog.find(query).sort({ timestamp: -1 }).limit(500).lean();
}

async function logAction({ user, action, entity, entityId, entityLabel, oldValue, newValue, reason }) {
  await AuditLog.create({
    userId: user?.userId || 'SYSTEM',
    userName: user?.name || 'SYSTEM',
    action,
    entity,
    entityId,
    entityLabel,
    oldValue: typeof oldValue === 'object' ? JSON.stringify(oldValue) : oldValue,
    newValue: typeof newValue === 'object' ? JSON.stringify(newValue) : newValue,
    reason,
  });
}

module.exports = { listAuditLogs, logAction };
