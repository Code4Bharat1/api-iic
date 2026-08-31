const Booking = require('../models/Booking');
const Resource = require('../models/Resource');
const User = require('../models/User');
const Issue = require('../models/Issue');
const AuditLog = require('../models/AuditLog');
const Floor = require('../models/Floor');
const { BOOKING_STATUS } = require('../utils/constants');
const { syncBookingStatus } = require('../utils/statusSync');
const { rangesOverlap } = require('../utils/time');

const TIMELINE_HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function floorUtilisation(date) {
  const floors = await Floor.find({ bookable: true }).lean();
  const bookings = await Booking.find({ date }).lean();
  return floors.map((floor) => {
    const floorBookings = bookings.filter(
      (b) => b.floor === floor.key && [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.EVENT_IN_PROGRESS, BOOKING_STATUS.AWAITING_CLOSURE].includes(b.status)
    );
    const bookedSlots = TIMELINE_HOURS.slice(0, -1).filter((hour, i) =>
      floorBookings.some((b) => rangesOverlap(hour, TIMELINE_HOURS[i + 1], b.startTime, b.endTime))
    ).length;
    return { floor: floor.key, name: floor.name, percent: Math.round((bookedSlots / (TIMELINE_HOURS.length - 1)) * 100) };
  });
}

async function resourceUtilisation() {
  const resources = await Resource.find({ active: true }).lean();
  const date = todayStr();
  const bookings = await Booking.find({
    date,
    status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.EVENT_IN_PROGRESS, BOOKING_STATUS.AWAITING_CLOSURE] },
  }).lean();

  return resources.map((resource) => {
    const reserved = bookings.reduce((sum, b) => {
      const line = b.resources.find((r) => String(r.resource) === String(resource._id));
      return sum + (line ? line.quantity : 0);
    }, 0);
    return {
      resourceId: resource._id,
      name: resource.name,
      floor: resource.floor,
      percent: resource.totalQuantity ? Math.round((reserved / resource.totalQuantity) * 100) : 0,
    };
  });
}

async function get(req, res) {
  const user = req.user;
  const today = todayStr();

  if (user.role === 'organiser') {
    const own = await Booking.find({ createdBy: user.userId });
    await Promise.all(own.map((b) => syncBookingStatus(b)));
    const fresh = own.map((b) => b.toObject());

    const upcoming = fresh.filter((b) => b.date >= today && [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.EVENT_IN_PROGRESS].includes(b.status));
    const pending = fresh.filter((b) => b.status === BOOKING_STATUS.PENDING_APPROVAL);
    const awaitingClosure = fresh.filter((b) => b.status === BOOKING_STATUS.AWAITING_CLOSURE);
    const confirmed = fresh.filter((b) => b.status === BOOKING_STATUS.CONFIRMED);
    const actionRequired = fresh.filter(
      (b) =>
        b.status === BOOKING_STATUS.CHANGE_REQUESTED ||
        b.status === BOOKING_STATUS.ISSUE_REPORTED ||
        (b.status === BOOKING_STATUS.AWAITING_CLOSURE && !b.closure?.submittedAt)
    );

    return res.json({
      role: 'organiser',
      stats: {
        upcomingEvents: upcoming.length,
        pendingApproval: pending.length,
        awaitingClosure: awaitingClosure.length,
        confirmedBookings: confirmed.length,
      },
      upcoming: upcoming.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8),
      actionRequired,
    });
  }

  // admin / master_admin
  const all = await Booking.find({});
  await Promise.all(all.map((b) => syncBookingStatus(b)));
  const fresh = all.map((b) => b.toObject());

  const todaysEvents = fresh.filter((b) => b.date === today);
  const pendingApprovals = fresh.filter((b) => b.status === BOOKING_STATUS.PENDING_APPROVAL);
  const changeRequested = fresh.filter((b) => b.status === BOOKING_STATUS.CHANGE_REQUESTED);
  const upcoming = fresh.filter((b) => b.date >= today && [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.EVENT_IN_PROGRESS].includes(b.status));
  const awaitingClosure = fresh.filter((b) => b.status === BOOKING_STATUS.AWAITING_CLOSURE);
  const openIssues = await Issue.countDocuments({ status: { $in: ['open', 'under_review'] } });

  const statusDistribution = Object.values(BOOKING_STATUS).map((status) => ({
    status,
    count: fresh.filter((b) => b.status === status).length,
  }));

  const payload = {
    role: user.role,
    stats: {
      todaysEvents: todaysEvents.length,
      pendingApprovals: pendingApprovals.length + changeRequested.length,
      upcomingEvents: upcoming.length,
      awaitingClosure: awaitingClosure.length,
      issuesReported: openIssues,
    },
    todaysEvents: todaysEvents.sort((a, b) => a.startTime.localeCompare(b.startTime)),
    pendingApprovals: pendingApprovals.concat(changeRequested).slice(0, 8),
    floorUtilisation: await floorUtilisation(today),
    resourceUtilisation: await resourceUtilisation(),
    statusDistribution,
  };

  if (user.role === 'master_admin') {
    payload.masterStats = {
      totalBookings: fresh.length,
      activeResources: await Resource.countDocuments({ active: true }),
      activeUsers: await User.countDocuments({ active: true }),
    };
    payload.recentAudit = await AuditLog.find().sort({ timestamp: -1 }).limit(6).lean();
    payload.recentApprovals = fresh
      .filter((b) => b.status === BOOKING_STATUS.CONFIRMED)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 5);
  }

  res.json(payload);
}

module.exports = { get };
