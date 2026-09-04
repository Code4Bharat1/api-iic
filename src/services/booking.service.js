const Booking = require('../models/Booking');
const Floor = require('../models/Floor');
const Issue = require('../models/Issue');
const Contact = require('../models/Contact');
const { BOOKING_STATUS, CLOSURE_CHECKLIST_ITEMS } = require('../utils/constants');
const { getFloorConflicts, validateBookingWindow } = require('../utils/availability');
const { validateResources } = require('../utils/validateResources');
const { nextBookingRef } = require('../utils/bookingRef');
const { logAction } = require('../services/audit.service');
const { notify } = require('../utils/notify');
const { syncBookingStatus } = require('../utils/statusSync');
const { getSettings } = require('../services/settings.service'); // TODO: move to settings service
const { toMinutes, rangesOverlap } = require('../utils/time');
const emailService = require('../services/email.service');

async function syncMany(bookings) {
  return Promise.all(bookings.map((b) => syncBookingStatus(b)));
}

function scopeForRole(user, query) {
  if (user.role === 'organiser') query.createdBy = user.userId;
  return query;
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

  if (body.arrangementContact) {
    const contact = await Contact.findById(body.arrangementContact);
    if (!contact || !contact.active) {
      errors.arrangementContact = 'Selected arrangement contact is invalid or inactive.';
    }
  }

  return errors;
}

async function listBookings(queryOptions, user) {
  const query = {};
  if (queryOptions.status) query.status = queryOptions.status;
  if (queryOptions.floor) query.floor = queryOptions.floor;
  if (queryOptions.date) query.date = queryOptions.date;
  if (queryOptions.from || queryOptions.to) {
    query.date = {};
    if (queryOptions.from) query.date.$gte = queryOptions.from;
    if (queryOptions.to) query.date.$lte = queryOptions.to;
  }
  if (queryOptions.organiser) query['organiser.name'] = new RegExp(queryOptions.organiser, 'i');
  if (queryOptions.search) {
    query.$or = [{ eventName: new RegExp(queryOptions.search, 'i') }, { bookingRef: new RegExp(queryOptions.search, 'i') }];
  }
  scopeForRole(user, query);

  const docs = await Booking.find(query).sort({ date: 1, startTime: 1 });
  return await syncMany(docs);
}

async function getBookingById(id, user) {
  const doc = await Booking.findById(id).populate('arrangementContact');
  if (!doc) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (user.role === 'organiser' && doc.createdBy !== user.userId) {
    throw Object.assign(new Error('You cannot view this booking.'), { status: 403 });
  }
  await syncBookingStatus(doc);
  return doc;
}

async function getCompetingBookings(id) {
  const booking = await Booking.findById(id).lean();
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });

  const candidates = await Booking.find({
    _id: { $ne: booking._id },
    floor: booking.floor,
    date: booking.date,
    status: { $in: [BOOKING_STATUS.PENDING_APPROVAL, BOOKING_STATUS.CHANGE_REQUESTED] },
  }).lean();

  return candidates
    .filter((c) => rangesOverlap(booking.startTime, booking.endTime, c.startTime, c.endTime))
    .map((c) => ({
      id: c._id,
      bookingRef: c.bookingRef,
      eventName: c.eventName,
      startTime: c.startTime,
      endTime: c.endTime,
      status: c.status,
      resources: c.resources.map((r) => ({ name: r.name, quantity: r.quantity })),
    }));
}

async function createBooking(body, user) {
  const errors = await validatePayload(body);
  if (Object.keys(errors).length) throw Object.assign(new Error('Validation failed'), { status: 400, errors });

  const { floor, date, startTime, endTime, resources, override, overrideReason, arrangementContact } = body;

  const conflicts = await getFloorConflicts({ floor, date, startTime, endTime });
  const isMasterOverride = user.role === 'master_admin' && override && overrideReason;
  if (conflicts.length && !isMasterOverride) {
    throw Object.assign(new Error(`This floor is already reserved from ${conflicts[0].startTime} to ${conflicts[0].endTime}.`), {
      status: 409,
      conflict: true,
      conflicts: conflicts.map((c) => ({ id: c._id, eventName: c.eventName, startTime: c.startTime, endTime: c.endTime })),
      canOverride: user.role === 'master_admin',
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
    throw Object.assign(new Error('Resource conflict'), { status: 409, resourceConflict: true, errors: resourceCheck.errors });
  }

  const bookingRef = await nextBookingRef();
  const booking = await Booking.create({
    bookingRef,
    eventName: body.eventName,
    purpose: body.purpose,
    expectedAttendance: body.expectedAttendance,
    organiser: body.organiser,
    floor,
    date,
    startTime,
    endTime,
    resources: resourceCheck.lines,
    specialRequirements: body.specialRequirements || '',
    arrangementContact: arrangementContact || undefined,
    createdBy: user.userId,
    status: BOOKING_STATUS.PENDING_APPROVAL,
    statusHistory: [{ status: BOOKING_STATUS.PENDING_APPROVAL, by: user.name, note: 'Booking submitted' }],
    conflictOverride: isMasterOverride
      ? { overridden: true, reason: overrideReason, by: user.name, at: new Date() }
      : undefined,
  });

  if (isMasterOverride) {
    await logAction({
      user,
      action: 'Conflict Override',
      entity: 'Booking',
      entityId: booking._id,
      entityLabel: booking.bookingRef,
      reason: overrideReason,
      newValue: `Overrode ${conflicts.length} conflicting booking(s)`,
    });
  }

  await logAction({
    user,
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

  // Email the organiser: booking received
  emailService.sendBookingConfirmation(booking);

  return booking;
}

async function updateBooking(id, body, user) {
  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (booking.createdBy !== user.userId && user.role === 'organiser') {
    throw Object.assign(new Error('You cannot edit this booking.'), { status: 403 });
  }
  if (![BOOKING_STATUS.CHANGE_REQUESTED, BOOKING_STATUS.DRAFT].includes(booking.status)) {
    throw Object.assign(new Error('Only bookings with changes requested can be edited.'), { status: 400 });
  }

  const errors = await validatePayload(body);
  if (Object.keys(errors).length) throw Object.assign(new Error('Validation failed'), { status: 400, errors });

  const { floor, date, startTime, endTime, resources, arrangementContact } = body;

  const conflicts = await getFloorConflicts({ floor, date, startTime, endTime, excludeBookingId: booking._id });
  if (conflicts.length) {
    throw Object.assign(new Error(`This floor is already reserved from ${conflicts[0].startTime} to ${conflicts[0].endTime}.`), {
      status: 409,
      conflict: true,
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
    throw Object.assign(new Error('Resource conflict'), { status: 409, resourceConflict: true, errors: resourceCheck.errors });
  }

  Object.assign(booking, {
    eventName: body.eventName,
    purpose: body.purpose,
    expectedAttendance: body.expectedAttendance,
    organiser: body.organiser,
    floor,
    date,
    startTime,
    endTime,
    resources: resourceCheck.lines,
    specialRequirements: body.specialRequirements || '',
    arrangementContact: arrangementContact || undefined,
    adminComment: '',
    status: BOOKING_STATUS.PENDING_APPROVAL,
  });
  booking.statusHistory.push({ status: BOOKING_STATUS.PENDING_APPROVAL, by: user.name, note: 'Resubmitted after changes' });
  await booking.save();

  await logAction({
    user,
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

  return booking;
}

async function approveBooking(id, body, user) {
  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (![BOOKING_STATUS.PENDING_APPROVAL, BOOKING_STATUS.CHANGE_REQUESTED].includes(booking.status)) {
    throw Object.assign(new Error('Only pending bookings can be approved.'), { status: 400 });
  }

  const { override, overrideReason } = body;
  const conflicts = await getFloorConflicts({
    floor: booking.floor,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    excludeBookingId: booking._id,
  });
  const isMasterOverride = user.role === 'master_admin' && override && overrideReason;
  if (conflicts.length && !isMasterOverride) {
    throw Object.assign(new Error(`This floor is already reserved from ${conflicts[0].startTime} to ${conflicts[0].endTime}.`), {
      status: 409,
      conflict: true,
      conflicts: conflicts.map((c) => ({ id: c._id, eventName: c.eventName, startTime: c.startTime, endTime: c.endTime })),
      canOverride: user.role === 'master_admin',
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
    throw Object.assign(new Error('Resource conflict'), { status: 409, resourceConflict: true, errors: resourceCheck.errors });
  }

  if (isMasterOverride) {
    booking.conflictOverride = { overridden: true, reason: overrideReason, by: user.name, at: new Date() };
    await logAction({
      user,
      action: 'Conflict Override',
      entity: 'Booking',
      entityId: booking._id,
      entityLabel: booking.bookingRef,
      reason: overrideReason,
      newValue: `Overrode ${conflicts.length} conflicting booking(s)`,
    });
  }

  booking.status = BOOKING_STATUS.CONFIRMED;
  booking.statusHistory.push({ status: BOOKING_STATUS.CONFIRMED, by: user.name, note: 'Approved by admin' });
  await booking.save();

  await logAction({
    user,
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

  // Email the organiser: booking approved
  emailService.sendBookingApproved(booking);

  return booking;
}

async function rejectBooking(id, body, user) {
  const { reason } = body;
  if (!reason) throw Object.assign(new Error('A rejection reason is required.'), { status: 400 });

  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (![BOOKING_STATUS.PENDING_APPROVAL, BOOKING_STATUS.CHANGE_REQUESTED].includes(booking.status)) {
    throw Object.assign(new Error('Only pending bookings can be rejected.'), { status: 400 });
  }

  booking.status = BOOKING_STATUS.REJECTED;
  booking.rejectionReason = reason;
  booking.statusHistory.push({ status: BOOKING_STATUS.REJECTED, by: user.name, note: reason });
  await booking.save();

  await logAction({
    user,
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

  // Email the organiser: booking rejected
  emailService.sendBookingRejected(booking, reason);

  return booking;
}

async function requestChangesBooking(id, body, user) {
  const { comment } = body;
  if (!comment) throw Object.assign(new Error('A comment is required to request changes.'), { status: 400 });

  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (booking.status !== BOOKING_STATUS.PENDING_APPROVAL) {
    throw Object.assign(new Error('Only pending bookings can have changes requested.'), { status: 400 });
  }

  booking.status = BOOKING_STATUS.CHANGE_REQUESTED;
  booking.adminComment = comment;
  booking.statusHistory.push({ status: BOOKING_STATUS.CHANGE_REQUESTED, by: user.name, note: comment });
  await booking.save();

  await logAction({
    user,
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

  // Email the organiser: changes requested
  emailService.sendChangesRequested(booking, comment);

  return booking;
}

async function submitClosurePhoto(id, file, category, user) {
  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (user.role === 'organiser' && booking.createdBy !== user.userId) {
    throw Object.assign(new Error('You cannot submit photos for this booking.'), { status: 403 });
  }
  if (!file) throw Object.assign(new Error('No photo uploaded.'), { status: 400 });

  const url = `/uploads/${file.filename}`;
  const photos = booking.closure.photos || {};
  photos[category] = [...(photos[category] || []), url];
  booking.closure.photos = photos;
  booking.markModified('closure.photos');
  await booking.save();

  return { url, photos: booking.closure.photos };
}

async function submitClosure(id, body, user) {
  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  
  if (user.role === 'organiser' && booking.createdBy !== user.userId) {
    throw Object.assign(new Error('You cannot submit closure for this booking.'), { status: 403 });
  }
  
  if (booking.status !== BOOKING_STATUS.AWAITING_CLOSURE) {
    throw Object.assign(new Error('This booking is not awaiting closure.'), { status: 400 });
  }

  const { checklist } = body;
  const incomplete = CLOSURE_CHECKLIST_ITEMS.some((item) => !checklist?.[item.key]);
  if (incomplete) throw Object.assign(new Error('Complete the full checklist before submitting.'), { status: 400 });

  let requiredPhotos = ['overallFloor'];
  const hasTables = booking.resources.some(r => r.name.toLowerCase().includes('table') || r.name.toLowerCase().includes('chair'));
  if (hasTables) requiredPhotos.push('tablesChairs');
  const hasTV = booking.resources.some(r => r.name.toLowerCase().includes('tv') || r.name.toLowerCase().includes('screen'));
  if (hasTV) requiredPhotos.push('interactiveTV');
  const hasMic = booking.resources.some(r => r.name.toLowerCase().includes('mic'));
  if (hasMic) requiredPhotos.push('microphones');

  const missingPhotos = requiredPhotos.filter(
    (cat) => !(booking.closure.photos?.[cat]?.length)
  );
  if (missingPhotos.length) {
    throw Object.assign(new Error('Upload required photos before submitting.'), { status: 400, missingPhotos });
  }

  booking.closure.checklist = checklist;
  booking.closure.submittedAt = new Date();
  booking.closure.submittedBy = user.name;
  booking.statusHistory.push({ status: BOOKING_STATUS.AWAITING_CLOSURE, by: user.name, note: 'Closure submitted for verification' });
  await booking.save();

  await logAction({
    user,
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

  return booking;
}

async function verifyClosure(id, user) {
  const booking = await Booking.findById(id);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });

  if (![BOOKING_STATUS.AWAITING_CLOSURE, BOOKING_STATUS.ISSUE_REPORTED].includes(booking.status)) {
    throw Object.assign(new Error('This booking is not ready for closure verification.'), { status: 400 });
  }
  if (booking.status === BOOKING_STATUS.AWAITING_CLOSURE && !booking.closure.submittedAt) {
    throw Object.assign(new Error('Closure has not been submitted yet.'), { status: 400 });
  }
  const openIssues = await Issue.countDocuments({ booking: booking._id, status: { $in: ['open', 'under_review'] } });
  if (openIssues > 0) {
    throw Object.assign(new Error('Resolve all open issues before closing this booking.'), { status: 400 });
  }

  booking.status = BOOKING_STATUS.CLOSED;
  booking.closure.verifiedAt = new Date();
  booking.closure.verifiedBy = user.name;
  booking.statusHistory.push({ status: BOOKING_STATUS.CLOSED, by: user.name, note: 'Closure verified' });
  await booking.save();

  await logAction({
    user,
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

  return booking;
}

module.exports = {
  listBookings,
  getBookingById,
  getCompetingBookings,
  createBooking,
  updateBooking,
  approveBooking,
  rejectBooking,
  requestChangesBooking,
  submitClosurePhoto,
  submitClosure,
  verifyClosure,
};
