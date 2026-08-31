const Booking = require('../models/Booking');
const Floor = require('../models/Floor');
const { BOOKING_STATUS } = require('../utils/constants');
const { getFloorConflicts, validateBookingWindow } = require('../utils/availability');
const { validateResources } = require('../utils/validateResources');
const { nextBookingRef } = require('../utils/bookingRef');
const { logAction } = require('../utils/audit');
const { notify } = require('../utils/notify');
const { syncBookingStatus } = require('../utils/statusSync');
const { getSettings } = require('./settingsController');
const { CLOSURE_CHECKLIST_ITEMS } = require('../utils/constants');
const { toMinutes, rangesOverlap } = require('../utils/time');

async function syncMany(bookings) {
  return Promise.all(bookings.map((b) => syncBookingStatus(b)));
}

function scopeForRole(user, query) {
  if (user.role === 'organiser') query.createdBy = user.userId;
  return query;
}

async function list(req, res) {
  const { status, floor, date, from, to, search, organiser } = req.query;
  const query = {};
  if (status) query.status = status;
  if (floor) query.floor = floor;
  if (date) query.date = date;
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }
  if (organiser) query['organiser.name'] = new RegExp(organiser, 'i');
  if (search) {
    query.$or = [{ eventName: new RegExp(search, 'i') }, { bookingRef: new RegExp(search, 'i') }];
  }
  scopeForRole(req.user, query);

  const docs = await Booking.find(query).sort({ date: 1, startTime: 1 });
  const synced = await syncMany(docs);
  res.json(synced);
}

async function getById(req, res) {
  const doc = await Booking.findById(req.params.id).populate('arrangementContact');
  if (!doc) return res.status(404).json({ error: 'Booking not found.' });
  if (req.user.role === 'organiser' && doc.createdBy !== req.user.userId) {
    return res.status(403).json({ error: 'You cannot view this booking.' });
  }
  await syncBookingStatus(doc);
  res.json(doc);
}

// Other PENDING requests (not yet reserving) that would compete for the same floor/
// resources if approved alongside this one — surfaced so Admin can spot the clash
// before approving either one (spec §10: "Admin dashboard should clearly flag
// competing requests").
async function competing(req, res) {
  const booking = await Booking.findById(req.params.id).lean();
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  const candidates = await Booking.find({
    _id: { $ne: booking._id },
    floor: booking.floor,
    date: booking.date,
    status: { $in: [BOOKING_STATUS.PENDING_APPROVAL, BOOKING_STATUS.CHANGE_REQUESTED] },
  }).lean();

  const overlapping = candidates.filter((c) => rangesOverlap(booking.startTime, booking.endTime, c.startTime, c.endTime));

  res.json(
    overlapping.map((c) => ({
      id: c._id,
      bookingRef: c.bookingRef,
      eventName: c.eventName,
      startTime: c.startTime,
      endTime: c.endTime,
      status: c.status,
      resources: c.resources.map((r) => ({ name: r.name, quantity: r.quantity })),
    }))
  );
}

async function validatePayload(body) {
  const errors = {};
  if (!body.eventName) errors.eventName = 'Event name is required.';
  if (!body.purpose) errors.purpose = 'Purpose is required.';
  if (!body.expectedAttendance || body.expectedAttendance <= 0) errors.expectedAttendance = 'Expected attendance is required.';
  if (!body.organiser?.name) errors['organiser.name'] = 'Organiser name is required.';
  if (!body.floor) errors.floor = 'Floor is required.';
  if (!body.date) errors.date = 'Date is required.';
  if (!body.startTime) errors.startTime = 'Start time is required.';
  if (!body.endTime) errors.endTime = 'End time is required.';

  if (body.startTime && body.endTime && toMinutes(body.endTime) <= toMinutes(body.startTime)) {
    errors.endTime = 'End time must be after start time.';
  }

  if (body.floor) {
    const floor = await Floor.findOne({ key: body.floor }).lean();
    if (!floor || !floor.bookable) errors.floor = 'Selected floor is not bookable.';
  }

  const settings = await getSettings();
  if (body.date && !validateBookingWindow(body.date, settings.bookingWindowMonths)) {
    errors.date = 'Booking date outside permitted window.';
  }

  return errors;
}

async function create(req, res) {
  const errors = await validatePayload(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const { floor, date, startTime, endTime, resources, override, overrideReason } = req.body;

  const conflicts = await getFloorConflicts({ floor, date, startTime, endTime });
  const isMasterOverride = req.user.role === 'master_admin' && override && overrideReason;
  if (conflicts.length && !isMasterOverride) {
    return res.status(409).json({
      conflict: true,
      message: `This floor is already reserved from ${conflicts[0].startTime} to ${conflicts[0].endTime}.`,
      conflicts: conflicts.map((c) => ({ id: c._id, eventName: c.eventName, startTime: c.startTime, endTime: c.endTime })),
      canOverride: req.user.role === 'master_admin',
    });
  }

  const resourceCheck = await validateResources({
    floor,
    date,
    startTime,
    endTime,
    requestedResources: (resources || []).map((r) => ({ resourceId: r.resourceId, quantity: r.quantity })),
  });
  if (!resourceCheck.ok) {
    return res.status(409).json({ resourceConflict: true, errors: resourceCheck.errors });
  }

  const bookingRef = await nextBookingRef();
  const booking = await Booking.create({
    bookingRef,
    eventName: req.body.eventName,
    purpose: req.body.purpose,
    expectedAttendance: req.body.expectedAttendance,
    organiser: req.body.organiser,
    floor,
    date,
    startTime,
    endTime,
    resources: resourceCheck.lines,
    specialRequirements: req.body.specialRequirements || '',
    arrangementContact: req.body.arrangementContact || undefined,
    createdBy: req.user.userId,
    status: BOOKING_STATUS.PENDING_APPROVAL,
    statusHistory: [{ status: BOOKING_STATUS.PENDING_APPROVAL, by: req.user.name, note: 'Booking submitted' }],
    conflictOverride: isMasterOverride
      ? { overridden: true, reason: overrideReason, by: req.user.name, at: new Date() }
      : undefined,
  });

  if (isMasterOverride) {
    await logAction({
      user: req.user,
      action: 'Conflict Override',
      entity: 'Booking',
      entityId: booking._id,
      entityLabel: booking.bookingRef,
      reason: overrideReason,
      newValue: `Overrode ${conflicts.length} conflicting booking(s)`,
    });
  }

  await logAction({
    user: req.user,
    action: 'Created Booking',
    entity: 'Booking',
    entityId: booking._id,
    entityLabel: booking.bookingRef,
    newValue: `${booking.eventName} — ${floor} — ${date} ${startTime}-${endTime}`,
  });

  await notify({
    target: { role: 'admin' },
    type: 'approval_required',
    message: `${booking.eventName} requires approval.`,
    booking,
  });

  res.status(201).json(booking);
}

async function update(req, res) {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.createdBy !== req.user.userId && req.user.role === 'organiser') {
    return res.status(403).json({ error: 'You cannot edit this booking.' });
  }
  if (![BOOKING_STATUS.CHANGE_REQUESTED, BOOKING_STATUS.DRAFT].includes(booking.status)) {
    return res.status(400).json({ error: 'Only bookings with changes requested can be edited.' });
  }

  const errors = await validatePayload(req.body);
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const { floor, date, startTime, endTime, resources } = req.body;

  const conflicts = await getFloorConflicts({ floor, date, startTime, endTime, excludeBookingId: booking._id });
  if (conflicts.length) {
    return res.status(409).json({
      conflict: true,
      message: `This floor is already reserved from ${conflicts[0].startTime} to ${conflicts[0].endTime}.`,
      conflicts: conflicts.map((c) => ({ id: c._id, eventName: c.eventName, startTime: c.startTime, endTime: c.endTime })),
    });
  }

  const resourceCheck = await validateResources({
    floor,
    date,
    startTime,
    endTime,
    requestedResources: (resources || []).map((r) => ({ resourceId: r.resourceId, quantity: r.quantity })),
    excludeBookingId: booking._id,
  });
  if (!resourceCheck.ok) {
    return res.status(409).json({ resourceConflict: true, errors: resourceCheck.errors });
  }

  Object.assign(booking, {
    eventName: req.body.eventName,
    purpose: req.body.purpose,
    expectedAttendance: req.body.expectedAttendance,
    organiser: req.body.organiser,
    floor,
    date,
    startTime,
    endTime,
    resources: resourceCheck.lines,
    specialRequirements: req.body.specialRequirements || '',
    adminComment: '',
    status: BOOKING_STATUS.PENDING_APPROVAL,
  });
  booking.statusHistory.push({ status: BOOKING_STATUS.PENDING_APPROVAL, by: req.user.name, note: 'Resubmitted after changes' });
  await booking.save();

  await logAction({
    user: req.user,
    action: 'Resubmitted Booking',
    entity: 'Booking',
    entityId: booking._id,
    entityLabel: booking.bookingRef,
  });

  await notify({
    target: { role: 'admin' },
    type: 'approval_required',
    message: `${booking.eventName} was resubmitted and requires approval.`,
    booking,
  });

  res.json(booking);
}

async function approve(req, res) {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (![BOOKING_STATUS.PENDING_APPROVAL, BOOKING_STATUS.CHANGE_REQUESTED].includes(booking.status)) {
    return res.status(400).json({ error: 'Only pending bookings can be approved.' });
  }

  const { override, overrideReason } = req.body;
  const conflicts = await getFloorConflicts({
    floor: booking.floor,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    excludeBookingId: booking._id,
  });
  const isMasterOverride = req.user.role === 'master_admin' && override && overrideReason;
  if (conflicts.length && !isMasterOverride) {
    return res.status(409).json({
      conflict: true,
      message: `This floor is already reserved from ${conflicts[0].startTime} to ${conflicts[0].endTime}.`,
      conflicts: conflicts.map((c) => ({ id: c._id, eventName: c.eventName, startTime: c.startTime, endTime: c.endTime })),
      canOverride: req.user.role === 'master_admin',
    });
  }

  const resourceCheck = await validateResources({
    floor: booking.floor,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    requestedResources: booking.resources.map((r) => ({ resourceId: r.resource, quantity: r.quantity })),
    excludeBookingId: booking._id,
  });
  if (!resourceCheck.ok) {
    return res.status(409).json({ resourceConflict: true, errors: resourceCheck.errors });
  }

  if (isMasterOverride) {
    booking.conflictOverride = { overridden: true, reason: overrideReason, by: req.user.name, at: new Date() };
    await logAction({
      user: req.user,
      action: 'Conflict Override',
      entity: 'Booking',
      entityId: booking._id,
      entityLabel: booking.bookingRef,
      reason: overrideReason,
      newValue: `Overrode ${conflicts.length} conflicting booking(s)`,
    });
  }

  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.statusHistory.push({ status: BOOKING_STATUS.CONFIRMED, by: req.user.name, note: 'Approved by admin' });
  await booking.save();

  await logAction({
    user: req.user,
    action: 'Approved Booking',
    entity: 'Booking',
    entityId: booking._id,
    entityLabel: booking.bookingRef,
  });

  await notify({
    target: { userId: booking.createdBy },
    type: 'booking_approved',
    message: `${booking.eventName} has been approved and confirmed.`,
    booking,
  });

  res.json(booking);
}

async function reject(req, res) {
  const { reason } = req.body;
  if (!reason) return res.status(400).json({ error: 'A rejection reason is required.' });

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (![BOOKING_STATUS.PENDING_APPROVAL, BOOKING_STATUS.CHANGE_REQUESTED].includes(booking.status)) {
    return res.status(400).json({ error: 'Only pending bookings can be rejected.' });
  }

  booking.status = BOOKING_STATUS.REJECTED;
  booking.rejectionReason = reason;
  booking.statusHistory.push({ status: BOOKING_STATUS.REJECTED, by: req.user.name, note: reason });
  await booking.save();

  await logAction({
    user: req.user,
    action: 'Rejected Booking',
    entity: 'Booking',
    entityId: booking._id,
    entityLabel: booking.bookingRef,
    reason,
  });

  await notify({
    target: { userId: booking.createdBy },
    type: 'booking_rejected',
    message: `${booking.eventName} was rejected: ${reason}`,
    booking,
  });

  res.json(booking);
}

async function requestChanges(req, res) {
  const { comment } = req.body;
  if (!comment) return res.status(400).json({ error: 'A comment is required to request changes.' });

  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.status !== BOOKING_STATUS.PENDING_APPROVAL) {
    return res.status(400).json({ error: 'Only pending bookings can have changes requested.' });
  }

  booking.status = BOOKING_STATUS.CHANGE_REQUESTED;
  booking.adminComment = comment;
  booking.statusHistory.push({ status: BOOKING_STATUS.CHANGE_REQUESTED, by: req.user.name, note: comment });
  await booking.save();

  await logAction({
    user: req.user,
    action: 'Requested Changes',
    entity: 'Booking',
    entityId: booking._id,
    entityLabel: booking.bookingRef,
    reason: comment,
  });

  await notify({
    target: { userId: booking.createdBy },
    type: 'change_requested',
    message: `Changes requested for ${booking.eventName}: ${comment}`,
    booking,
  });

  res.json(booking);
}

async function submitClosurePhoto(req, res) {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  const { category } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' });

  const url = `/uploads/${req.file.filename}`;
  const photos = booking.closure.photos || {};
  photos[category] = [...(photos[category] || []), url];
  booking.closure.photos = photos;
  booking.markModified('closure.photos');
  await booking.save();

  res.status(201).json({ url, photos: booking.closure.photos });
}

async function submitClosure(req, res) {
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.status !== BOOKING_STATUS.AWAITING_CLOSURE) {
    return res.status(400).json({ error: 'This booking is not awaiting closure.' });
  }

  const { checklist } = req.body;
  const incomplete = CLOSURE_CHECKLIST_ITEMS.some((item) => !checklist?.[item.key]);
  if (incomplete) return res.status(400).json({ error: 'Complete the full checklist before submitting.' });

  const missingPhotos = ['overallFloor', 'tablesChairs', 'interactiveTV', 'microphones', 'other'].filter(
    (cat) => !(booking.closure.photos?.[cat]?.length)
  );
  if (missingPhotos.length) {
    return res.status(400).json({ error: 'Upload at least one photo for every category before submitting.', missingPhotos });
  }

  booking.closure.checklist = checklist;
  booking.closure.submittedAt = new Date();
  booking.closure.submittedBy = req.user.name;
  booking.statusHistory.push({ status: BOOKING_STATUS.AWAITING_CLOSURE, by: req.user.name, note: 'Closure submitted for verification' });
  await booking.save();

  await logAction({
    user: req.user,
    action: 'Submitted Closure',
    entity: 'Booking',
    entityId: booking._id,
    entityLabel: booking.bookingRef,
  });

  await notify({
    target: { role: 'admin' },
    type: 'closure_submitted',
    message: `Closure submitted for ${booking.eventName}, awaiting verification.`,
    booking,
  });

  res.json(booking);
}

async function verifyClosure(req, res) {
  const Issue = require('../models/Issue');
  const booking = await Booking.findById(req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  if (![BOOKING_STATUS.AWAITING_CLOSURE, BOOKING_STATUS.ISSUE_REPORTED].includes(booking.status)) {
    return res.status(400).json({ error: 'This booking is not ready for closure verification.' });
  }
  if (booking.status === BOOKING_STATUS.AWAITING_CLOSURE && !booking.closure.submittedAt) {
    return res.status(400).json({ error: 'Closure has not been submitted yet.' });
  }
  const openIssues = await Issue.countDocuments({ booking: booking._id, status: { $in: ['open', 'under_review'] } });
  if (openIssues > 0) {
    return res.status(400).json({ error: 'Resolve all open issues before closing this booking.' });
  }

  booking.status = BOOKING_STATUS.CLOSED;
  booking.closure.verifiedAt = new Date();
  booking.closure.verifiedBy = req.user.name;
  booking.statusHistory.push({ status: BOOKING_STATUS.CLOSED, by: req.user.name, note: 'Closure verified' });
  await booking.save();

  await logAction({
    user: req.user,
    action: 'Verified Closure',
    entity: 'Booking',
    entityId: booking._id,
    entityLabel: booking.bookingRef,
  });

  await notify({
    target: { userId: booking.createdBy },
    type: 'closure_verified',
    message: `${booking.eventName} has been closed. Resources released.`,
    booking,
  });

  res.json(booking);
}

module.exports = {
  list,
  getById,
  create,
  update,
  approve,
  reject,
  requestChanges,
  submitClosurePhoto,
  submitClosure,
  verifyClosure,
  competing,
};
