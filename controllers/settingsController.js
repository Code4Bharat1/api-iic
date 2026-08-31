const Setting = require('../models/Setting');
const { logAction } = require('../utils/audit');

async function getSettings() {
  let settings = await Setting.findOne({ key: 'global' });
  if (!settings) settings = await Setting.create({ key: 'global' });
  return settings;
}

async function get(req, res) {
  res.json(await getSettings());
}

async function update(req, res) {
  const settings = await getSettings();
  const before = settings.toObject();
  ['bookingWindowMonths', 'orgName', 'notifyOnApproval', 'notifyOnClosure'].forEach((field) => {
    if (req.body[field] !== undefined) settings[field] = req.body[field];
  });
  await settings.save();

  await logAction({
    user: req.user,
    action: 'Updated Settings',
    entity: 'Setting',
    entityId: settings._id,
    entityLabel: 'Global Settings',
    oldValue: before,
    newValue: settings.toObject(),
  });

  res.json(settings);
}

module.exports = { get, update, getSettings };
