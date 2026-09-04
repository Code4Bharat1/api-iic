const Issue = require('../models/Issue');
const Booking = require('../models/Booking');
const { BOOKING_STATUS, ISSUE_STATUS } = require('../utils/constants');
const { logAction } = require('../services/audit.service');
const { notify } = require('../utils/notify');

async function nextIssueId() {
  const count = await Issue.countDocuments();
  return `ISS-${String(count + 1).padStart(4, '0')}`;
}

async function listIssues(queryOptions) {
  const { search, status, resource, booking } = queryOptions;
  const query = {};
  if (status) query.status = status;
  if (booking) query.bookingRef = booking;
  if (resource) query.resourceName = new RegExp(resource, 'i');
  if (search) query.$or = [{ issueId: new RegExp(search, 'i') }, { resourceName: new RegExp(search, 'i') }, { bookingRef: new RegExp(search, 'i') }];

  const issues = await Issue.find(query).sort({ reportedAt: -1 }).lean();
  return issues;
}

async function getIssueById(id) {
  const issue = await Issue.findById(id).populate('booking').lean();
  if (!issue) throw Object.assign(new Error('Issue not found.'), { status: 404 });
  return issue;
}

async function uploadIssuePhoto(file) {
  if (!file) throw Object.assign(new Error('No photo uploaded.'), { status: 400 });
  return { url: `/uploads/${file.filename}` };
}

async function createIssue(body, user) {
  const { bookingId, resourceName, issueType, description, photos } = body;
  const booking = await Booking.findById(bookingId);
  if (!booking) throw Object.assign(new Error('Booking not found.'), { status: 404 });
  if (!resourceName || !issueType) throw Object.assign(new Error('Resource and issue type are required.'), { status: 400 });

  const issue = await Issue.create({
    issueId: await nextIssueId(),
    booking: booking._id,
    bookingRef: booking.bookingRef,
    resourceName,
    issueType,
    description: description || '',
    photos: photos || [],
    reportedBy: user.name,
  });

  booking.status = BOOKING_STATUS.ISSUE_REPORTED;
  booking.statusHistory.push({ status: BOOKING_STATUS.ISSUE_REPORTED, by: user.name, note: `${resourceName}: ${issueType}` });
  await booking.save();

  await logAction({
    user,
    action: 'Reported Issue',
    entity: 'Issue',
    entityId: issue._id,
    entityLabel: issue.issueId,
    newValue: `${resourceName} — ${issueType}`,
    reason: description || '',
  });

  await notify({
    target: { userId: booking.createdBy },
    type: 'issue_reported',
    message: `An issue was reported for ${booking.eventName}: ${resourceName} (${issueType}).`,
    booking,
  });

  return issue;
}

async function resolveIssue(id, body, user) {
  const issue = await Issue.findById(id);
  if (!issue) throw Object.assign(new Error('Issue not found.'), { status: 404 });
  const { resolution, status } = body;

  issue.status = status && Object.values(ISSUE_STATUS).includes(status) ? status : ISSUE_STATUS.RESOLVED;
  if (issue.status === ISSUE_STATUS.RESOLVED || issue.status === ISSUE_STATUS.CLOSED) {
    issue.resolution = resolution || '';
    issue.resolvedBy = user.name;
    issue.resolvedAt = new Date();
  }
  await issue.save();

  await logAction({
    user,
    action: 'Resolved Issue',
    entity: 'Issue',
    entityId: issue._id,
    entityLabel: issue.issueId,
    reason: resolution || '',
  });

  await notify({
    target: { role: 'admin' },
    type: 'issue_resolved',
    message: `Issue ${issue.issueId} (${issue.resourceName}) marked ${issue.status}.`,
    booking: { _id: issue.booking, bookingRef: issue.bookingRef },
  });

  return issue;
}

module.exports = { listIssues, getIssueById, createIssue, resolveIssue, uploadIssuePhoto };
