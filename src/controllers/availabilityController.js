const availabilityService = require('../services/availability.service');

async function check(req, res) {
  const result = await availabilityService.checkAvailability(req.query);
  res.json(result);
}

async function timeline(req, res) {
  const result = await availabilityService.getTimeline(req.query);
  res.json(result);
}

module.exports = { check, timeline };
