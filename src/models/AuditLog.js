const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    userId: { type: String, required: true },
    userName: { type: String, required: true },
    action: { type: String, required: true },
    entity: { type: String, required: true }, // Booking, Resource, User, Contact, Issue...
    entityId: { type: String, required: true },
    entityLabel: { type: String, default: '' },
    oldValue: { type: String, default: '' },
    newValue: { type: String, default: '' },
    reason: { type: String, default: '' },
  },
  { timestamps: false }
);

module.exports = mongoose.model('AuditLog', auditLogSchema);
