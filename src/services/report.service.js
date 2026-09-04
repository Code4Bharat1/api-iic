const Booking = require('../models/Booking');
const Issue = require('../models/Issue');
const Floor = require('../models/Floor');
const Resource = require('../models/Resource');
const { BOOKING_STATUS } = require('../utils/constants');
const { rangesOverlap } = require('../utils/time');

function bookingQuery({ from, to, floor, organiser, status }, user) {
  const query = {};
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }
  if (floor) query.floor = floor;
  if (organiser) query['organiser.name'] = new RegExp(organiser, 'i');
  if (status) query.status = status;
  
  if (user && user.role === 'organiser') {
    query.createdBy = user.userId;
  }
  return query;
}

const TIMELINE_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

async function runReport(type, filters, user) {
  // If the user is an organiser, enforce that they can only see their own bookings if they hit report routes (though they shouldn't even reach here due to route guards).
  // But just in case:
  
  switch (type) {
    case 'bookings':
    case 'history': {
      const query = bookingQuery(filters, user);
      if (type === 'history') delete query.status;
      const rows = await Booking.find(query).sort({ date: -1 }).lean();
      return { rows, summary: { total: rows.length } };
    }

    case 'floor-utilisation': {
      const floors = await Floor.find({ bookable: true }).lean();
      const bookings = await Booking.find(bookingQuery(filters, user)).lean();
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
      return { rows, summary: { totalBookings: bookings.length } };
    }

    case 'resource-utilisation': {
      const resources = await Resource.find({ active: true }).lean();
      const bookings = await Booking.find(bookingQuery(filters, user)).lean();
      const rows = resources.map((resource) => {
        const relevant = bookings.filter((b) => b.resources.some((r) => String(r.resource) === String(resource._id)));
        const totalRequested = relevant.reduce((sum, b) => {
          const line = b.resources.find((r) => String(r.resource) === String(resource._id));
          return sum + (line ? line.quantity : 0);
        }, 0);
        return { resourceId: resource._id, name: resource.name, floor: resource.floor, totalQuantity: resource.totalQuantity, bookingsUsing: relevant.length, totalRequested };
      });
      return { rows, summary: { resources: rows.length } };
    }

    case 'issues': {
      const query = {};
      if (filters.status) query.status = filters.status;
      if (filters.resource) query.resourceName = new RegExp(filters.resource, 'i');
      const rows = await Issue.find(query).sort({ reportedAt: -1 }).lean();
      return { rows, summary: { total: rows.length, open: rows.filter((r) => r.status === 'open').length } };
    }

    case 'pending-closures': {
      const query = { status: { $in: [BOOKING_STATUS.AWAITING_CLOSURE, BOOKING_STATUS.ISSUE_REPORTED] } };
      if (user && user.role === 'organiser') {
        query.createdBy = user.userId;
      }
      const rows = await Booking.find(query).sort({ date: -1 }).lean();
      return { rows, summary: { total: rows.length } };
    }

    case 'cancellations': {
      const query = { status: BOOKING_STATUS.REJECTED };
      if (user && user.role === 'organiser') {
        query.createdBy = user.userId;
      }
      const rows = await Booking.find(query).sort({ updatedAt: -1 }).lean();
      return { rows, summary: { total: rows.length } };
    }

    default:
      throw Object.assign(new Error(`Unknown report type: ${type}`), { status: 404 });
  }
}

module.exports = { runReport };
