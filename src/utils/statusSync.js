const { BOOKING_STATUS } = require('./constants');

// Confirmed bookings drift forward automatically as wall-clock time passes
// through their date/time window. Terminal/manual states (rejected, issue_reported,
// closed, change_requested, pending_approval) never auto-transition.
function computeDerivedStatus(booking, now = new Date()) {
  if (![BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.EVENT_IN_PROGRESS].includes(booking.status)) {
    return booking.status;
  }
  const start = new Date(`${booking.date}T${booking.startTime}:00`);
  const end = new Date(`${booking.date}T${booking.endTime}:00`);
  if (now < start) return BOOKING_STATUS.CONFIRMED;
  if (now >= start && now < end) return BOOKING_STATUS.EVENT_IN_PROGRESS;
  return BOOKING_STATUS.AWAITING_CLOSURE;
}

// Mutates + saves the booking doc if its derived status has moved on; returns the doc.
async function syncBookingStatus(bookingDoc) {
  const derived = computeDerivedStatus(bookingDoc);
  if (derived !== bookingDoc.status) {
    bookingDoc.status = derived;
    bookingDoc.statusHistory.push({ status: derived, by: 'system', note: 'Automatic time-based transition' });
    await bookingDoc.save();
  }
  return bookingDoc;
}

module.exports = { computeDerivedStatus, syncBookingStatus };
