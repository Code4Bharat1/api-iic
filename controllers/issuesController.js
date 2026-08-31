const Issue = require('../models/Issue');
const Booking = require('../models/Booking');
const { BOOKING_STATUS, ISSUE_STATUS } = require('../utils/constants');
const { logAction } = require('../utils/audit');
const { notify } = require('../utils/notify');

async function nextIssueId() {
  const count = await Issue.countDocuments();
  return `ISS-${String(count + 1).padStart(4, '0')}`;
}

async function list(req, res) {
  const { search, status, resource, booking } = req.query;
  const query = {};
  if (status) query.status = status;
  if (booking) query.bookingRef = booking;
  if (resource) query.resourceName = new RegExp(resource, 'i');
  if (search) query.$or = [{ issueId: new RegExp(search, 'i') }, { resourceName: new RegExp(search, 'i') }, { bookingRef: new RegExp(search, 'i') }];

  const issues = await Issue.find(query).sort({ reportedAt: -1 }).lean();
  res.json(issues);
}

async function getById(req, res) {
  const issue = await Issue.findById(req.params.id).populate('booking').lean();
  if (!issue) return res.status(404).json({ error: 'Issue not found.' });
  res.json(issue);
}

async function uploadPhoto(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No photo uploaded.' });
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
}

async function create(req, res) {
  const { bookingId, resourceName, issueType, description, photos } = req.body;
  const booking = await Booking.findById(bookingId);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (!resourceName || !issueType) return res.status(400).json({ error: 'Resource and issue type are required.' });

  const issue = await Issue.create({
    issueId: await nextIssueId(),
    booking: booking._id,
    bookingRef: booking.bookingRef,
    resourceName,
    issueType,
    description: description || '',
    photos: photos || [],
    reportedBy: req.user.name,
  });

  booking.status = BOOKING_STATUS.ISSUE_REPORTED;
  booking.statusHistory.push({ status: BOOKING_STATUS.ISSUE_REPORTED, by: req.user.name, note: `${resourceName}: ${issueType}` });
  await booking.save();

  await logAction({
    user: req.user,
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

  res.status(201).json(issue);
}

async function resolve(req, res) {
  const issue = await Issue.findById(req.params.id);
  if (!issue) return res.status(404).json({ error: 'Issue not found.' });
  const { resolution, status } = req.body;

  issue.status = status && Object.values(ISSUE_STATUS).includes(status) ? status : ISSUE_STATUS.RESOLVED;
  if (issue.status === ISSUE_STATUS.RESOLVED || issue.status === ISSUE_STATUS.CLOSED) {
    issue.resolution = resolution || '';
    issue.resolvedBy = req.user.name;
    issue.resolvedAt = new Date();
  }
  await issue.save();

  await logAction({
    user: req.user,
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

  res.json(issue);
}

module.exports = { list, getById, create, resolve, uploadPhoto };
