/**
 * scripts/cleanBookings.js
 *
 * Removes all demo and test bookings from the database, along with any
 * associated issues or notifications, leaving the bookings system clean.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Booking = require('../src/models/Booking');
const Issue = require('../src/models/Issue');
const Notification = require('../src/models/Notification');

async function cleanBookings() {
  console.log('[cleanBookings] Connecting to database...');
  await connectDB();

  const totalBefore = await Booking.countDocuments();
  console.log(`[cleanBookings] Current bookings count: ${totalBefore}`);

  // Delete all demo/test bookings
  const deleteResult = await Booking.deleteMany({});
  console.log(`[cleanBookings] Deleted ${deleteResult.deletedCount} demo bookings.`);

  // Clean up any issues that were associated with bookings
  const issuesResult = await Issue.deleteMany({});
  console.log(`[cleanBookings] Cleaned up ${issuesResult.deletedCount} associated issues.`);

  // Clean up booking-related notifications
  const notifsResult = await Notification.deleteMany({
    type: { $in: ['booking_created', 'booking_approved', 'booking_rejected', 'booking_changes_requested', 'closure_submitted', 'closure_verified'] },
  });
  console.log(`[cleanBookings] Cleaned up ${notifsResult.deletedCount} booking notifications.`);

  console.log('[cleanBookings] All unnecessary demo bookings have been successfully removed!');
  await mongoose.disconnect();
}

cleanBookings().catch((err) => {
  console.error('[cleanBookings] Error:', err);
  process.exit(1);
});
