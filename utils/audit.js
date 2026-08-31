const AuditLog = require('../models/AuditLog');

async function logAction({ user, action, entity, entityId, entityLabel = '', oldValue = '', newValue = '', reason = '' }) {
  return AuditLog.create({
    userId: user.userId,
    userName: user.name,
    action,
    entity,
    entityId: String(entityId),
    entityLabel,
    oldValue: typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue),
    newValue: typeof newValue === 'string' ? newValue : JSON.stringify(newValue),
    reason,
  });
}

module.exports = { logAction };
