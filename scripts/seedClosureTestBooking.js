/**
 * scripts/seedClosureTestBooking.js
 *
 * Seeds ONE booking whose event has already ended (status: awaiting_closure,
 * closure not yet submitted) so the closure workflow can be tested end-to-end:
 *   1. Log in as the organiser and submit closure (checklist + photos).
 *   2. Log in as admin/master admin and verify closure -> booking becomes closed.
 *
 * Does NOT touch any other collection — safe to run against a live dev DB.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Resource = require('../src/models/Resource');
const Booking = require('../src/models/Booking');
const { nextBookingRef } = require('../src/utils/bookingRef');
const { BOOKING_STATUS } = require('../src/utils/constants');

function dateStr(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function run() {
  await connectDB();

  const organiser = await User.findOne({ role: 'organiser' }).lean();
  if (!organiser) throw new Error('No organiser user found — seed users first.');

  const floor = 'basement';
  const resources = await Resource.find({
    active: true,
    $or: [{ inventoryScope: 'shared' }, { floors: floor }],
    name: { $in: [/chair/i, /table/i, /mic/i, /interactive tv/i] },
  }).lean();

  const lines = resources.slice(0, 3).map((r) => ({
    resource: r._id,
    name: r.name,
    unitType: r.unitType,
    quantity: r.unitType === 'toggle' ? 1 : Math.min(10, r.totalQuantity || 1),
  }));

  const bookingRef = await nextBookingRef();
  const date = dateStr(-1);

  const booking = await Booking.create({
    bookingRef,
    eventName: 'Closure Test Event',
    purpose: 'Seeded booking for testing the closure workflow.',
    expectedAttendance: 30,
    organiser: {
      name: organiser.name,
      userId: organiser.userId,
      department: organiser.department || '',
      mobile: organiser.mobile || '',
      email: organiser.email || '',
    },
    floor,
    date,
    startTime: '10:00',
    endTime: '12:00',
    resources: lines,
    specialRequirements: '',
    status: BOOKING_STATUS.AWAITING_CLOSURE,
    statusHistory: [
      { status: BOOKING_STATUS.PENDING_APPROVAL, by: organiser.name, note: 'Booking submitted' },
      { status: BOOKING_STATUS.CONFIRMED, by: 'IIC Operations Admin', note: 'Approved by admin' },
      { status: BOOKING_STATUS.AWAITING_CLOSURE, by: 'system', note: 'Automatic time-based transition' },
    ],
    createdBy: organiser.userId,
  });

  console.log('[seed] Created booking ready for closure testing:');
  console.log(`  bookingRef: ${booking.bookingRef}`);
  console.log(`  floor: ${floor}, date: ${date}, time: 10:00-12:00`);
  console.log(`  resources attached: ${lines.map((l) => `${l.name} x${l.quantity}`).join(', ') || '(none found)'}`);
  console.log(`  status: ${booking.status} (closure not yet submitted)`);
  console.log('\nTest as organiser:');
  console.log(`  organiser@iic.org / Organiser@123 -> open "${booking.eventName}" -> Submit Closure`);
  console.log('Then as admin:');
  console.log('  admin@iic.org / Admin@123 (or master.admin@iic.org / MasterAdmin@123) -> verify closure');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
