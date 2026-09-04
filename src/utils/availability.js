const Booking = require('../models/Booking');
const { RESERVING_STATUSES } = require('./constants');
const { rangesOverlap } = require('./time');

/**
 * Bookings on the same floor/date, in a reserving status, whose time range
 * overlaps [startTime, endTime). Pending/rejected/closed bookings never conflict.
 */
async function getFloorConflicts({ floor, date, startTime, endTime, excludeBookingId }) {
  const query = {
    floor,
    date,
    status: { $in: RESERVING_STATUSES },
  };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };

  const candidates = await Booking.find(query).lean();
  return candidates.filter((b) => rangesOverlap(startTime, endTime, b.startTime, b.endTime));
}

/**
 * Period-based availability for one resource: total minus whatever is reserved
 * by overlapping bookings in a reserving status on the same floor/date.
 */
async function getResourceAvailability({ resource, date, startTime, endTime, excludeBookingId }) {
  const query = {
    floor: resource.floor,
    date,
    status: { $in: RESERVING_STATUSES },
    'resources.resource': resource._id,
  };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };

  const candidates = await Booking.find(query).lean();
  const overlapping = candidates.filter((b) => rangesOverlap(startTime, endTime, b.startTime, b.endTime));

  const reserved = overlapping.reduce((sum, b) => {
    const line = b.resources.find((r) => String(r.resource) === String(resource._id));
    return sum + (line ? line.quantity : 0);
  }, 0);

  return {
    resourceId: String(resource._id),
    name: resource.name,
    unitType: resource.unitType,
    total: resource.totalQuantity,
    reserved,
    available: Math.max(resource.totalQuantity - reserved, 0),
  };
}

/**
 * Booking window = current calendar month + (bookingWindowMonths - 1) following months.
 */
function validateBookingWindow(dateStr, bookingWindowMonths = 2) {
  const today = new Date();
  const windowStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const windowEnd = new Date(today.getFullYear(), today.getMonth() + bookingWindowMonths, 1);
  const target = new Date(`${dateStr}T00:00:00`);
  return target >= windowStart && target < windowEnd;
}

module.exports = { getFloorConflicts, getResourceAvailability, validateBookingWindow };
