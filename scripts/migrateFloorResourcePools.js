/**
 * scripts/migrateFloorResourcePools.js
 *
 * One-off migration for the switch from a single `floor` string on Resource
 * to a pooled `floors` array:
 *
 *   1. Backfills `floors` on any resource still carrying the legacy `floor`
 *      field (from before this change), then drops the legacy field.
 *   2. Merges resources that were created as duplicate per-floor rows for the
 *      same logical item (e.g. "Testing" on Basement / 1st Floor / Ground
 *      Floor, each with its own full quantity) into a single resource whose
 *      `floors` array covers all of them, re-pointing any existing bookings
 *      at the surviving resource so historical data stays intact.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Resource = require('../src/models/Resource');
const Booking = require('../src/models/Booking');

function groupKey(r) {
  return [r.name.trim().toLowerCase(), r.category, r.unitType, r.totalQuantity, (r.notes || '').trim()].join('|');
}

async function backfillLegacyFloor() {
  const raw = await Resource.collection.find({ floor: { $exists: true } }).toArray();
  if (!raw.length) {
    console.log('[migrate] No legacy `floor` fields to backfill.');
    return;
  }
  console.log(`[migrate] Backfilling floors[] on ${raw.length} legacy resource(s)...`);
  for (const doc of raw) {
    const isShared = !doc.inventoryScope || doc.inventoryScope === 'shared' || doc.floor === 'all';
    const floors = isShared ? [] : [doc.floor];
    await Resource.collection.updateOne(
      { _id: doc._id },
      { $set: { floors, inventoryScope: isShared ? 'shared' : 'floor' }, $unset: { floor: '' } }
    );
  }
  console.log('[migrate] Legacy floor backfill complete.');
}

async function mergeDuplicateFloorResources() {
  const resources = await Resource.find({ inventoryScope: 'floor' }).sort({ createdAt: 1 }).lean();
  const groups = new Map();
  for (const r of resources) {
    const key = groupKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const duplicateGroups = [...groups.values()].filter((g) => g.length > 1);
  if (!duplicateGroups.length) {
    console.log('[migrate] No duplicate floor-scoped resources to merge.');
    return;
  }

  for (const group of duplicateGroups) {
    const [survivor, ...losers] = group;
    const mergedFloors = [...new Set(group.flatMap((r) => r.floors || []))];
    const mergedHistory = group
      .flatMap((r) => r.history || [])
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log(
      `[migrate] Merging "${survivor.name}" (${survivor.category}, qty ${survivor.totalQuantity}): ` +
      `${group.length} rows -> floors [${mergedFloors.join(', ')}], survivor ${survivor._id}`
    );

    await Resource.updateOne(
      { _id: survivor._id },
      { $set: { floors: mergedFloors, history: mergedHistory } }
    );

    const loserIds = losers.map((l) => l._id);
    const affectedBookings = await Booking.find({ 'resources.resource': { $in: loserIds } });
    for (const booking of affectedBookings) {
      const byResourceId = new Map();
      for (const line of booking.resources) {
        const rid = String(loserIds.some((id) => String(id) === String(line.resource)) ? survivor._id : line.resource);
        if (byResourceId.has(rid)) {
          byResourceId.get(rid).quantity += line.quantity;
        } else {
          byResourceId.set(rid, { resource: rid, name: line.name, unitType: line.unitType, quantity: line.quantity });
        }
      }
      booking.resources = [...byResourceId.values()];
      await booking.save();
    }
    if (affectedBookings.length) {
      console.log(`[migrate]   Re-pointed ${affectedBookings.length} booking(s) to the surviving resource.`);
    }

    await Resource.deleteMany({ _id: { $in: loserIds } });
    console.log(`[migrate]   Deleted ${loserIds.length} duplicate row(s).`);
  }
}

async function run() {
  await connectDB();
  await backfillLegacyFloor();
  await mergeDuplicateFloorResources();
  console.log('[migrate] Done.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
