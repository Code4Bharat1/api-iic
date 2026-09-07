const Booking = require('../models/Booking');
const { RESERVING_STATUSES, BOOKING_STATUS } = require('./constants');
const { toMinutes, rangesOverlap } = require('./time');

// Statuses that should block availability from an organiser's perspective
// (includes pending/change-requested so slots being reviewed are not double-booked)
const BLOCKING_STATUSES = [
  ...RESERVING_STATUSES,
  BOOKING_STATUS.PENDING_APPROVAL,
  BOOKING_STATUS.CHANGE_REQUESTED,
];

/**
 * Bookings on the same floor/date, in a reserving status, whose time range
 * overlaps [startTime, endTime). Pending/rejected/closed bookings never conflict.
 */
async function getFloorConflicts({ floor, date, startTime, endTime, excludeBookingId }) {
  const query = {
    floor,
    date,
    status: { $in: BLOCKING_STATUSES },
  };
  if (excludeBookingId) query._id = { $ne: excludeBookingId };

  const candidates = await Booking.find(query).lean();
  return candidates.filter((b) => rangesOverlap(startTime, endTime, b.startTime, b.endTime));
}

/**
 * Given a requested [startTime, endTime] window and a list of conflicting bookings,
 * computes the free sub-windows within that range.
 * Returns an array of { start, end } objects in "HH:mm" format.
 */
function getFreeWindows(startTime, endTime, conflicts) {
  const rangeStart = toMinutes(startTime);
  const rangeEnd   = toMinutes(endTime);

  // Build sorted list of blocked intervals clipped to our range
  const blocked = conflicts
    .map((c) => ({
      s: Math.max(toMinutes(c.startTime), rangeStart),
      e: Math.min(toMinutes(c.endTime),   rangeEnd),
    }))
    .filter((b) => b.s < b.e)
    .sort((a, b) => a.s - b.s);

  const free = [];
  let cursor = rangeStart;

  for (const blk of blocked) {
    if (cursor < blk.s) {
      free.push({ start: minsToHHmm(cursor), end: minsToHHmm(blk.s) });
    }
    cursor = Math.max(cursor, blk.e);
  }
  if (cursor < rangeEnd) {
    free.push({ start: minsToHHmm(cursor), end: minsToHHmm(rangeEnd) });
  }

  return free;
}

function minsToHHmm(mins) {
  const h = Math.floor(mins / 60).toString().padStart(2, '0');
  const m = (mins % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Period-based availability for one resource: total minus whatever is reserved
 * by overlapping bookings in a reserving status.
 * For shared resources (default), reservations across ALL floors are counted.
 * For floor-specific resources, reservations on that specific floor are counted.
 */
async function getResourceAvailability(arg1, arg2, arg3, arg4, arg5) {
  let resource, date, startTime, endTime, excludeBookingId;
  if (arg1 && typeof arg1 === 'object' && ('resource' in arg1 || 'date' in arg1)) {
    ({ resource, date, startTime, endTime, excludeBookingId } = arg1);
  } else {
    resource = arg1;
    date = arg2;
    startTime = arg3;
    endTime = arg4;
    excludeBookingId = arg5;
  }

  if (resource && (typeof resource === 'string' || resource instanceof require('mongoose').Types.ObjectId)) {
    const Resource = require('../models/Resource');
    resource = await Resource.findById(resource).lean();
  }

  if (!resource) {
    return {
      resourceId: null,
      name: '',
      unitType: 'quantity',
      inventoryScope: 'shared',
      total: 0,
      reserved: 0,
      available: 0,
    };
  }

  const isShared = !resource.inventoryScope || resource.inventoryScope === 'shared' || resource.floor === 'all';

  const query = {
    date,
    status: { $in: BLOCKING_STATUSES },
    'resources.resource': resource._id,
  };

  if (!isShared && resource.floor && resource.floor !== 'all') {
    query.floor = resource.floor;
  }

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
    inventoryScope: isShared ? 'shared' : 'floor',
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

module.exports = { getFloorConflicts, getResourceAvailability, validateBookingWindow, getFreeWindows };
