/**
 * scripts/resetResources.js
 *
 * Resets the resources collection to a clean, standardized inventory
 * across all floors, while safely updating existing bookings' resource
 * references so historical bookings and audit integrity remain intact.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Resource = require('../src/models/Resource');
const Booking = require('../src/models/Booking');

const CLEAN_INVENTORY = [
  // Basement
  { name: 'Chairs', category: 'Seating', inventoryScope: 'floor', floors: ['basement'], unitType: 'quantity', totalQuantity: 150, active: true },
  { name: 'Tables', category: 'Furniture', inventoryScope: 'floor', floors: ['basement'], unitType: 'quantity', totalQuantity: 30, active: true },
  { name: 'Microphones', category: 'Audio', inventoryScope: 'floor', floors: ['basement'], unitType: 'quantity', totalQuantity: 10, active: true },
  { name: 'Podium', category: 'Furniture', inventoryScope: 'floor', floors: ['basement'], unitType: 'quantity', totalQuantity: 2, active: true },
  { name: 'Extension Boards', category: 'Electronics', inventoryScope: 'floor', floors: ['basement'], unitType: 'quantity', totalQuantity: 10, active: true },
  { name: 'Interactive TV', category: 'Electronics', inventoryScope: 'floor', floors: ['basement'], unitType: 'toggle', totalQuantity: 1, active: true },

  // First Floor
  { name: 'Chairs', category: 'Seating', inventoryScope: 'floor', floors: ['first'], unitType: 'quantity', totalQuantity: 120, active: true },
  { name: 'Tables', category: 'Furniture', inventoryScope: 'floor', floors: ['first'], unitType: 'quantity', totalQuantity: 20, active: true },
  { name: 'Microphones', category: 'Audio', inventoryScope: 'floor', floors: ['first'], unitType: 'quantity', totalQuantity: 10, active: true },
  { name: 'Podium', category: 'Furniture', inventoryScope: 'floor', floors: ['first'], unitType: 'quantity', totalQuantity: 2, active: true },
  { name: 'Extension Boards', category: 'Electronics', inventoryScope: 'floor', floors: ['first'], unitType: 'quantity', totalQuantity: 10, active: true },

  // Second Floor
  { name: 'Chairs', category: 'Seating', inventoryScope: 'floor', floors: ['second'], unitType: 'quantity', totalQuantity: 180, active: true },
  { name: 'Tables', category: 'Furniture', inventoryScope: 'floor', floors: ['second'], unitType: 'quantity', totalQuantity: 35, active: true },
  { name: 'Microphones', category: 'Audio', inventoryScope: 'floor', floors: ['second'], unitType: 'quantity', totalQuantity: 10, active: true },
  { name: 'Podium', category: 'Furniture', inventoryScope: 'floor', floors: ['second'], unitType: 'quantity', totalQuantity: 2, active: true },
  { name: 'Extension Boards', category: 'Electronics', inventoryScope: 'floor', floors: ['second'], unitType: 'quantity', totalQuantity: 10, active: true },
  { name: 'Interactive TV', category: 'Electronics', inventoryScope: 'floor', floors: ['second'], unitType: 'toggle', totalQuantity: 1, active: true },
];

async function resetResources() {
  console.log('[resetResources] Connecting to MongoDB...');
  await connectDB();

  console.log('[resetResources] Wiping existing resources collection...');
  await Resource.deleteMany({});

  console.log('[resetResources] Inserting clean baseline inventory...');
  const docsToInsert = CLEAN_INVENTORY.map((item) => ({
    ...item,
    notes: '',
    history: [
      {
        timestamp: new Date(),
        action: 'Created',
        newQuantity: item.totalQuantity,
        changedBy: 'System Administrator',
        reason: 'Clean inventory initialization',
      },
    ],
  }));

  const createdResources = await Resource.insertMany(docsToInsert);
  console.log(`[resetResources] Inserted ${createdResources.length} clean resource records.`);

  // Create lookup map: `${floor}:${name.toLowerCase()}` -> resourceDoc
  const resourceMap = new Map();
  for (const res of createdResources) {
    for (const floorKey of res.floors) {
      resourceMap.set(`${floorKey}:${res.name.toLowerCase()}`, res);
    }
  }

  // Update existing bookings to link to new resource IDs
  console.log('[resetResources] Updating existing booking references...');
  const bookings = await Booking.find({});
  let updatedCount = 0;

  for (const b of bookings) {
    if (!b.resources || b.resources.length === 0) continue;

    let modified = false;
    const updatedResources = [];

    for (const r of b.resources) {
      const key = `${b.floor}:${(r.name || '').toLowerCase()}`;
      const matched = resourceMap.get(key);
      if (matched) {
        updatedResources.push({
          resource: matched._id,
          name: matched.name,
          unitType: matched.unitType,
          quantity: r.quantity,
        });
        modified = true;
      } else {
        // Keep if no exact match found
        updatedResources.push(r);
      }
    }

    if (modified) {
      b.resources = updatedResources;
      await b.save();
      updatedCount++;
    }
  }

  console.log(`[resetResources] Successfully remapped resources in ${updatedCount} bookings.`);
  console.log('[resetResources] Done! Resource inventory is clean and unified.');

  await mongoose.disconnect();
}

resetResources().catch((err) => {
  console.error('[resetResources] Error:', err);
  process.exit(1);
});
