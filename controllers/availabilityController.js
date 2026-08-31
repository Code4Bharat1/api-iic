const Floor = require('../models/Floor');
const Resource = require('../models/Resource');
const { getFloorConflicts, getResourceAvailability } = require('../utils/availability');
const { rangesOverlap } = require('../utils/time');

const TIMELINE_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

// Single floor/date/time check used by the New Booking wizard (Step 03) and quick lookups.
async function check(req, res) {
  const { floor, date, start, end } = req.query;
  if (!floor || !date || !start || !end) return res.status(400).json({ error: 'floor, date, start and end are required.' });

  const conflicts = await getFloorConflicts({ floor, date, startTime: start, endTime: end });
  const resources = await Resource.find({ floor, active: true }).lean();
  const resourceAvailability = await Promise.all(
    resources.map((resource) => getResourceAvailability({ resource, date, startTime: start, endTime: end }))
  );

  res.json({
    available: conflicts.length === 0,
    conflicts: conflicts.map((c) => ({ id: c._id, eventName: c.eventName, startTime: c.startTime, endTime: c.endTime })),
    resources: resourceAvailability,
  });
}

// Hourly grid across bookable floors for a given date — the Availability page's visual timeline.
async function timeline(req, res) {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required.' });

  const floors = await Floor.find({ bookable: true }).sort({ createdAt: 1 }).lean();
  const Booking = require('../models/Booking');
  const { RESERVING_STATUSES } = require('../utils/constants');
  const bookings = await Booking.find({ date, status: { $in: RESERVING_STATUSES } }).lean();

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

  res.json({ hours: TIMELINE_HOURS, grid });
}

module.exports = { check, timeline };
