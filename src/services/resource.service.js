const Resource = require('../models/Resource');
const Booking = require('../models/Booking');
const { getResourceAvailability } = require('../utils/availability');
const { logAction } = require('../services/audit.service');
const { RESERVING_STATUSES } = require('../utils/constants');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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

async function listResources(queryOptions) {
  const { search, category, floor, status } = queryOptions;
  const query = {};
  if (category) query.category = category;
  if (floor) query.floor = floor;
  if (status === 'active') query.active = true;
  if (status === 'inactive') query.active = false;
  if (search) query.name = new RegExp(search, 'i');

  const resources = await Resource.find(query).sort({ floor: 1, category: 1, name: 1 }).lean();
  return await withTodayAvailability(resources);
}

async function getCatalog(queryOptions) {
  const { floor, date, start, end } = queryOptions;
  if (!floor || !date || !start || !end) {
    throw Object.assign(new Error('floor, date, start and end are required.'), { status: 400 });
  }
  const resources = await Resource.find({ floor, active: true }).lean();
  const results = await Promise.all(
    resources.map((resource) => getResourceAvailability({ resource, date, startTime: start, endTime: end }))
  );
  return results;
}

async function getResourceById(id) {
  const resource = await Resource.findById(id).lean();
  if (!resource) throw Object.assign(new Error('Resource not found.'), { status: 404 });

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

  return { ...resource, allocations: allocationList };
}

async function createResource(body, user) {
  const { name, category, floor, unitType, totalQuantity, notes } = body;
  if (!name || !category || !floor) throw Object.assign(new Error('name, category and floor are required.'), { status: 400 });

  // Phase 5 validation logic for quantities
  const parsedQuantity = totalQuantity !== undefined ? Number(totalQuantity) : 1;
  if (isNaN(parsedQuantity) || parsedQuantity < 0) {
    throw Object.assign(new Error('Quantity must be a positive number.'), { status: 400 });
  }

  const resource = await Resource.create({
    name,
    category,
    floor,
    unitType: unitType || 'quantity',
    totalQuantity: parsedQuantity,
    notes: notes || '',
    history: [{ action: 'Created', newQuantity: parsedQuantity, changedBy: user.name, reason: 'Initial setup' }],
  });

  await logAction({
    user,
    action: 'Created Resource',
    entity: 'Resource',
    entityId: resource._id,
    entityLabel: resource.name,
    newValue: resource.toObject(),
  });

  return resource;
}

async function updateResource(id, body, user) {
  const resource = await Resource.findById(id);
  if (!resource) throw Object.assign(new Error('Resource not found.'), { status: 404 });

  const before = resource.toObject();
  const { name, category, floor, totalQuantity, notes, reason } = body;

  if (totalQuantity !== undefined) {
    const parsedQuantity = Number(totalQuantity);
    if (isNaN(parsedQuantity) || parsedQuantity < 0) {
      throw Object.assign(new Error('Quantity must be a positive number.'), { status: 400 });
    }
    if (parsedQuantity !== resource.totalQuantity) {
      resource.history.push({
        action: 'Quantity Updated',
        oldQuantity: resource.totalQuantity,
        newQuantity: parsedQuantity,
        changedBy: user.name,
        reason: reason || '',
      });
      resource.totalQuantity = parsedQuantity;
    }
  }

  if (floor !== undefined && floor !== resource.floor) {
    resource.history.push({
      action: 'Floor Reassigned',
      changedBy: user.name,
      reason: reason || `${resource.floor} → ${floor}`,
    });
    resource.floor = floor;
  }
  if (name !== undefined) resource.name = name;
  if (category !== undefined) resource.category = category;
  if (notes !== undefined) resource.notes = notes;

  await resource.save();

  await logAction({
    user,
    action: 'Updated Resource',
    entity: 'Resource',
    entityId: resource._id,
    entityLabel: resource.name,
    oldValue: before,
    newValue: { name: resource.name, category: resource.category, floor: resource.floor, totalQuantity: resource.totalQuantity, notes: resource.notes },
    reason: reason || '',
  });

  return resource;
}

async function setResourceActive(id, body, user) {
  const resource = await Resource.findById(id);
  if (!resource) throw Object.assign(new Error('Resource not found.'), { status: 404 });
  resource.active = !!body.active;
  resource.history.push({
    action: resource.active ? 'Enabled' : 'Disabled',
    changedBy: user.name,
    reason: body.reason || '',
  });
  await resource.save();

  await logAction({
    user,
    action: resource.active ? 'Enabled Resource' : 'Disabled Resource',
    entity: 'Resource',
    entityId: resource._id,
    entityLabel: resource.name,
    reason: body.reason || '',
  });

  return resource;
}

module.exports = { listResources, getCatalog, getResourceById, createResource, updateResource, setResourceActive };
