const Setting = require('../models/Setting');
const { logAction } = require('../services/audit.service');

async function getSettings() {
  let settings = await Setting.findOne({ key: 'global' });
  if (!settings) settings = await Setting.create({ key: 'global' });
  return settings;
}

async function updateSettings(body, user) {
  const settings = await getSettings();
  const before = settings.toObject();
  
  ['bookingWindowMonths', 'orgName', 'notifyOnApproval', 'notifyOnClosure'].forEach((field) => {
    if (body[field] !== undefined) settings[field] = body[field];
  });
  
  await settings.save();

  await logAction({
    user,
    action: 'Updated Settings',
    entity: 'Setting',
    entityId: settings._id,
    entityLabel: 'Global Settings',
    oldValue: before,
    newValue: settings.toObject(),
  });

  return settings;
}

module.exports = { getSettings, updateSettings };
