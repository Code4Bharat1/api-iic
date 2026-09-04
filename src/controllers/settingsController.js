const settingsService = require('../services/settings.service');

async function get(req, res) {
  res.json(await settingsService.getSettings());
}

async function update(req, res) {
  res.json(await settingsService.updateSettings(req.body, req.user));
}

module.exports = { get, update, getSettings: settingsService.getSettings };
