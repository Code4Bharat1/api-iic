const Booking = require('../models/Booking');

async function nextBookingRef() {
  const year = new Date().getFullYear();
  const prefix = `IIC-${year}-`;
  const last = await Booking.findOne({ bookingRef: new RegExp(`^${prefix}`) })
    .sort({ bookingRef: -1 })
    .lean();
  const lastNum = last ? parseInt(last.bookingRef.split('-')[2], 10) : 100; // start at 0101 like the spec examples
  return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
}

module.exports = { nextBookingRef };
