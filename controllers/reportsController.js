const Booking = require('../models/Booking');
const Issue = require('../models/Issue');
const Floor = require('../models/Floor');
const Resource = require('../models/Resource');
const { BOOKING_STATUS } = require('../utils/constants');
const { rangesOverlap } = require('../utils/time');

function bookingQuery({ from, to, floor, organiser, status }) {
  const query = {};
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }
  if (floor) query.floor = floor;
  if (organiser) query['organiser.name'] = new RegExp(organiser, 'i');
  if (status) query.status = status;
  return query;
}

const TIMELINE_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

async function run(req, res) {
  const { type } = req.params;
  const filters = req.query;

  switch (type) {
    case 'bookings':
    case 'history': {
      const query = bookingQuery(filters);
      const rows = await Booking.find(type === 'history' ? bookingQuery({ ...filters, status: undefined }) : query)
        .sort({ date: -1 })
        .lean();
      return res.json({ rows, summary: { total: rows.length } });
    }

    case 'floor-utilisation': {
      const floors = await Floor.find({ bookable: true }).lean();
      const bookings = await Booking.find(bookingQuery(filters)).lean();
      const rows = floors.map((floor) => {
        const days = {};
        bookings
          .filter((b) => b.floor === floor.key && [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.EVENT_IN_PROGRESS, BOOKING_STATUS.AWAITING_CLOSURE, BOOKING_STATUS.CLOSED].includes(b.status))
          .forEach((b) => {
            days[b.date] = days[b.date] || [];
            days[b.date].push(b);
          });
        const dayCount = Object.keys(days).length || 1;
        const totalPercent = Object.values(days).reduce((sum, dayBookings) => {
          const bookedSlots = TIMELINE_HOURS.slice(0, -1).filter((hour, i) =>
            dayBookings.some((b) => rangesOverlap(hour, TIMELINE_HOURS[i + 1], b.startTime, b.endTime))
          ).length;
          return sum + (bookedSlots / (TIMELINE_HOURS.length - 1)) * 100;
        }, 0);
        return { floor: floor.key, name: floor.name, bookings: bookings.filter((b) => b.floor === floor.key).length, avgUtilisation: Math.round(totalPercent / dayCount) };
      });
      return res.json({ rows, summary: { totalBookings: bookings.length } });
    }

    case 'resource-utilisation': {
      const resources = await Resource.find({ active: true }).lean();
      const bookings = await Booking.find(bookingQuery(filters)).lean();
      const rows = resources.map((resource) => {
        const relevant = bookings.filter((b) => b.resources.some((r) => String(r.resource) === String(resource._id)));
        const totalRequested = relevant.reduce((sum, b) => {
          const line = b.resources.find((r) => String(r.resource) === String(resource._id));
          return sum + (line ? line.quantity : 0);
        }, 0);
        return { resourceId: resource._id, name: resource.name, floor: resource.floor, totalQuantity: resource.totalQuantity, bookingsUsing: relevant.length, totalRequested };
      });
      return res.json({ rows, summary: { resources: rows.length } });
    }

    case 'issues': {
      const query = {};
      if (filters.status) query.status = filters.status;
      if (filters.resource) query.resourceName = new RegExp(filters.resource, 'i');
      const rows = await Issue.find(query).sort({ reportedAt: -1 }).lean();
      return res.json({ rows, summary: { total: rows.length, open: rows.filter((r) => r.status === 'open').length } });
    }

    case 'pending-closures': {
      const rows = await Booking.find({ status: { $in: [BOOKING_STATUS.AWAITING_CLOSURE, BOOKING_STATUS.ISSUE_REPORTED] } })
        .sort({ date: -1 })
        .lean();
      return res.json({ rows, summary: { total: rows.length } });
    }

    case 'cancellations': {
      const rows = await Booking.find({ status: BOOKING_STATUS.REJECTED }).sort({ updatedAt: -1 }).lean();
      return res.json({ rows, summary: { total: rows.length } });
    }

    default:
      return res.status(404).json({ error: `Unknown report type: ${type}` });
  }
}

module.exports = { run };
