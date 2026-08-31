const Resource = require('../models/Resource');
const Booking = require('../models/Booking');
const { getResourceAvailability } = require('../utils/availability');
const { logAction } = require('../utils/audit');
const { RESERVING_STATUSES } = require('../utils/constants');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Annotates each resource with its Reserved/Available quantity for *today* — the
// "at a glance" figures the Resource Management table (spec §18) is meant to show.
// (Reserved/Available are inherently period-bound; "today" is the reference period
// here, and the exact-window figures are available on the resource detail page.)
async function withTodayAvailability(resources) {
  const date = todayStr();
  const bookings = await Booking.find({ date, status: { $in: RESERVING_STATUSES } })
    .select('resources')
    .lean();

  return resources.map((resource) => {
    const reserved = bookings.reduce((sum, b) => {
      const line = b.resources.find((r) => String(r.resource) === String(resource._id));
      return sum + (line ? line.quantity : 0);
    }, 0);
    return { ...resource, reservedToday: reserved, availableToday: Math.max(resource.totalQuantity - reserved, 0) };
  });
}

async function list(req, res) {
  const { search, category, floor, status } = req.query;
  const query = {};
  if (category) query.category = category;
  if (floor) query.floor = floor;
  if (status === 'active') query.active = true;
  if (status === 'inactive') query.active = false;
  if (search) query.name = new RegExp(search, 'i');

  const resources = await Resource.find(query).sort({ floor: 1, category: 1, name: 1 }).lean();
  res.json(await withTodayAvailability(resources));
}

// Full catalog for a floor with live availability for a given date/time window —
// what the New Booking wizard's Resources step and the Availability page render.
async function catalog(req, res) {
  const { floor, date, start, end } = req.query;
  if (!floor || !date || !start || !end) {
    return res.status(400).json({ error: 'floor, date, start and end are required.' });
  }
  const resources = await Resource.find({ floor, active: true }).lean();
  const results = await Promise.all(
    resources.map((resource) => getResourceAvailability({ resource, date, startTime: start, endTime: end }))
  );
  res.json(results);
}

async function getById(req, res) {
  const resource = await Resource.findById(req.params.id).lean();
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });

  const allocations = await Booking.find({ 'resources.resource': resource._id })
    .sort({ date: -1 })
    .select('bookingRef eventName date startTime endTime status resources')
    .lean();

  const allocationList = allocations.map((b) => ({
    bookingId: b._id,
    bookingRef: b.bookingRef,
    event: b.eventName,
    date: b.date,
    time: `${b.startTime}-${b.endTime}`,
    status: b.status,
    quantity: b.resources.find((r) => String(r.resource) === String(resource._id))?.quantity || 0,
  }));

  res.json({ ...resource, allocations: allocationList });
}

async function create(req, res) {
  const { name, category, floor, unitType, totalQuantity, notes } = req.body;
  if (!name || !category || !floor) return res.status(400).json({ error: 'name, category and floor are required.' });

  const resource = await Resource.create({
    name,
    category,
    floor,
    unitType: unitType || 'quantity',
    totalQuantity: totalQuantity ?? 1,
    notes: notes || '',
    history: [{ action: 'Created', newQuantity: totalQuantity ?? 1, changedBy: req.user.name, reason: 'Initial setup' }],
  });

  await logAction({
    user: req.user,
    action: 'Created Resource',
    entity: 'Resource',
    entityId: resource._id,
    entityLabel: resource.name,
    newValue: resource.toObject(),
  });

  res.status(201).json(resource);
}

async function update(req, res) {
  const resource = await Resource.findById(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });

  const before = resource.toObject();
  const { name, category, floor, totalQuantity, notes, reason } = req.body;

  if (totalQuantity !== undefined && totalQuantity !== resource.totalQuantity) {
    resource.history.push({
      action: 'Quantity Updated',
      oldQuantity: resource.totalQuantity,
      newQuantity: totalQuantity,
      changedBy: req.user.name,
      reason: reason || '',
    });
    resource.totalQuantity = totalQuantity;
  }
  if (floor !== undefined && floor !== resource.floor) {
    resource.history.push({
      action: 'Floor Reassigned',
      changedBy: req.user.name,
      reason: reason || `${resource.floor} → ${floor}`,
    });
    resource.floor = floor;
  }
  if (name !== undefined) resource.name = name;
  if (category !== undefined) resource.category = category;
  if (notes !== undefined) resource.notes = notes;

  await resource.save();

  await logAction({
    user: req.user,
    action: 'Updated Resource',
    entity: 'Resource',
    entityId: resource._id,
    entityLabel: resource.name,
    oldValue: before,
    newValue: { name: resource.name, category: resource.category, floor: resource.floor, totalQuantity: resource.totalQuantity, notes: resource.notes },
    reason: reason || '',
  });

  res.json(resource);
}

async function setActive(req, res) {
  const resource = await Resource.findById(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });
  resource.active = !!req.body.active;
  resource.history.push({
    action: resource.active ? 'Enabled' : 'Disabled',
    changedBy: req.user.name,
    reason: req.body.reason || '',
  });
  await resource.save();

  await logAction({
    user: req.user,
    action: resource.active ? 'Enabled Resource' : 'Disabled Resource',
    entity: 'Resource',
    entityId: resource._id,
    entityLabel: resource.name,
    reason: req.body.reason || '',
  });

  res.json(resource);
}

module.exports = { list, catalog, getById, create, update, setActive };
