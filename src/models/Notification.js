const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // target: either a specific userId, or a role ('admin', 'master_admin', 'organiser') to broadcast to
    targetUserId: { type: String, default: null },
    targetRole: { type: String, default: null },
    type: { type: String, required: true },
    message: { type: String, required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    bookingRef: { type: String, default: '' },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

module.exports = mongoose.model('Notification', notificationSchema);
