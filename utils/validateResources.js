const Resource = require('../models/Resource');
const { getResourceAvailability } = require('./availability');

/**
 * requestedResources: [{ resourceId, quantity }]
 * Returns { ok, lines, errors } where lines carries the resolved name/unitType/availability
 * for every requested line (used to build the review + booking snapshot).
 */
async function validateResources({ floor, date, startTime, endTime, requestedResources, excludeBookingId }) {
  const lines = [];
  const errors = [];

  for (const req of requestedResources || []) {
    if (!req.quantity) continue;
    const resource = await Resource.findById(req.resourceId).lean();
    if (!resource || !resource.active || resource.floor !== floor) {
      errors.push({ resourceId: req.resourceId, message: 'Resource is not available on this floor.' });
      continue;
    }
    const avail = await getResourceAvailability({ resource, date, startTime, endTime, excludeBookingId });
    if (req.quantity > avail.available) {
      errors.push({
        resourceId: req.resourceId,
        name: resource.name,
        requested: req.quantity,
        available: avail.available,
        message: `Only ${avail.available} ${resource.name} ${resource.unitType === 'toggle' ? 'is' : 'are'} available during this period.`,
      });
    }
    lines.push({
      resource: resource._id,
      name: resource.name,
      unitType: resource.unitType,
      quantity: req.quantity,
    });
  }

  return { ok: errors.length === 0, lines, errors };
}

module.exports = { validateResources };
