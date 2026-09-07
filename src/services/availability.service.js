const Floor = require('../models/Floor');
const Resource = require('../models/Resource');
const Booking = require('../models/Booking');
const { getFloorConflicts, getResourceAvailability, getFreeWindows } = require('../utils/availability');
const { rangesOverlap } = require('../utils/time');
const { RESERVING_STATUSES, BOOKING_STATUS } = require('../utils/constants');

// Statuses shown as "booked" on the timeline (same set as BLOCKING_STATUSES in availability.js)
const TIMELINE_BLOCKING_STATUSES = [
  ...RESERVING_STATUSES,
  BOOKING_STATUS.PENDING_APPROVAL,
  BOOKING_STATUS.CHANGE_REQUESTED,
];

const TIMELINE_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

async function checkAvailability(query) {
  const { floor, date, start, end } = query;
  if (!floor || !date || !start || !end) throw Object.assign(new Error('floor, date, start and end are required.'), { status: 400 });

  const conflicts = await getFloorConflicts({ floor, date, startTime: start, endTime: end });
  const resources = await Resource.find({ floor, active: true }).lean();
  const resourceAvailability = await Promise.all(
    resources.map((resource) => getResourceAvailability({ resource, date, startTime: start, endTime: end }))
  );

  // Compute the free sub-windows within the requested range
  const freeWindows = getFreeWindows(start, end, conflicts);

  return {
    available: conflicts.length === 0,
    conflicts: conflicts.map((c) => ({ id: c._id, eventName: c.eventName, startTime: c.startTime, endTime: c.endTime })),
    freeWindows,          // available slots inside the selected range
    resources: resourceAvailability,
  };
}

async function getTimeline(query) {
  const { date } = query;
  if (!date) throw Object.assign(new Error('date is required.'), { status: 400 });

  const floors = await Floor.find({ bookable: true }).sort({ createdAt: 1 }).lean();
  // Include pending/change-requested bookings so the grid is consistent with checkAvailability
  const bookings = await Booking.find({ date, status: { $in: TIMELINE_BLOCKING_STATUSES } }).lean();

  const grid = floors.map((floor) => {
    const floorBookings = bookings.filter((b) => b.floor === floor.key);
    const slots = TIMELINE_HOURS.slice(0, -1).map((hour, i) => {
      const nextHour = TIMELINE_HOURS[i + 1];
      const match = floorBookings.find((b) => rangesOverlap(hour, nextHour, b.startTime, b.endTime));
      return match
        ? { hour, status: 'booked', bookingId: match._id, eventName: match.eventName, startTime: match.startTime, endTime: match.endTime }
        : { hour, status: 'available' };
    });
    return { floor: floor.key, floorName: floor.name, slots };
  });

  return { hours: TIMELINE_HOURS, grid };
}

module.exports = { checkAvailability, getTimeline };

