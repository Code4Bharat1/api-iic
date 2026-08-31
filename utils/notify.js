const Notification = require('../models/Notification');

// target = { userId } for a specific user, or { role } to broadcast to a role
async function notify({ target, type, message, booking }) {
  return Notification.create({
    targetUserId: target.userId || null,
    targetRole: target.role || null,
    type,
    message,
    booking: booking ? booking._id : undefined,
    bookingRef: booking ? booking.bookingRef : '',
  });
}

module.exports = { notify };
