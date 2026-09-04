const bookingService = require('../services/booking.service');

async function track(req, res) {
  const { ref } = req.params;
  const Booking = require('../models/Booking');
  const doc = await Booking.findOne({ bookingRef: ref }).lean();
  if (!doc) {
    return res.status(404).json({ error: 'Tracking reference not found.' });
  }

  // Sync status before returning, like getBookingById does
  const { syncBookingStatus } = require('../utils/statusSync');
  await syncBookingStatus(doc);

  // Return limited public tracking data
  res.json({
    bookingRef: doc.bookingRef,
    eventName: doc.eventName,
    status: doc.status,
    floor: doc.floor,
    date: doc.date,
    startTime: doc.startTime,
    endTime: doc.endTime,
    statusHistory: doc.statusHistory,
    rejectionReason: doc.rejectionReason,
  });
}

module.exports = { track };
