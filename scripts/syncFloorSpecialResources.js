/**
 * scripts/syncFloorSpecialResources.js
 *
 * One-off backfill for the Floor "Interactive TV" / "Mic Arrangement" settings
 * checkboxes: they previously had no effect beyond the Floor document itself,
 * so floors already flagged on never got a matching bookable Resource. This
 * creates/activates that Resource for every floor currently flagged on.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Floor = require('../src/models/Floor');
const Resource = require('../src/models/Resource');

const SPECIAL_RESOURCES = {
  interactiveTV: { name: 'Interactive TV', category: 'Electronics' },
  micArrangement: { name: 'Mic Arrangement', category: 'Audio' },
};

async function syncSpecialResource(floor, flagKey, enabled) {
  const spec = SPECIAL_RESOURCES[flagKey];
  const existing = await Resource.findOne({
    name: new RegExp(`^${spec.name}$`, 'i'),
    inventoryScope: 'floor',
    floors: [floor.key],
  });

  if (existing) {
    if (existing.active !== enabled) {
      existing.active = enabled;
      existing.history.push({
        action: enabled ? 'Enabled' : 'Disabled',
        changedBy: 'System Administrator',
        reason: `Floor setting: ${spec.name} ${enabled ? 'enabled' : 'disabled'} for ${floor.name}`,
      });
      await existing.save();
      console.log(`[sync] Updated existing "${spec.name}" for ${floor.name} -> active=${enabled}`);
    }
    return;
  }

  if (enabled) {
    await Resource.create({
      name: spec.name,
      category: spec.category,
      inventoryScope: 'floor',
      floors: [floor.key],
      unitType: 'toggle',
      totalQuantity: 1,
      active: true,
      history: [{ action: 'Created', newQuantity: 1, changedBy: 'System Administrator', reason: `Auto-created from floor setting for ${floor.name}` }],
    });
    console.log(`[sync] Created "${spec.name}" resource for ${floor.name}`);
  }
}

async function run() {
  await connectDB();
  const floors = await Floor.find({}).lean();
  for (const floor of floors) {
    if (floor.interactiveTV) await syncSpecialResource(floor, 'interactiveTV', true);
    if (floor.micArrangement) await syncSpecialResource(floor, 'micArrangement', true);
  }
  console.log('[sync] Done.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[sync] Failed:', err);
  process.exit(1);
});
