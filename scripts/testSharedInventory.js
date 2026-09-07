require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Resource = require('../src/models/Resource');
const Booking = require('../src/models/Booking');
const User = require('../src/models/User');
const { getResourceAvailability } = require('../src/utils/availability');
const { validateResources } = require('../src/utils/validateResources');
const resourceService = require('../src/services/resource.service');

async function runTests() {
  await connectDB();
  console.log('=== STARTING SHARED RESOURCE INVENTORY TESTS ===');

  // 1. Get or create Phone shared resource
  let phone = await Resource.findOne({ name: /phone/i });
  if (!phone) {
    phone = await Resource.create({
      name: 'Phone',
      category: 'Electronics',
      inventoryScope: 'shared',
      floor: 'all',
      totalQuantity: 20,
      active: true,
    });
  } else {
    phone.inventoryScope = 'shared';
    phone.floor = 'all';
    phone.totalQuantity = 20;
    phone.active = true;
    await phone.save();
  }
  console.log(`[PASS 1] Phone resource configured: scope=${phone.inventoryScope}, floor=${phone.floor}, totalQty=${phone.totalQuantity}`);

  // Find an organizer user
  let organizer = await User.findOne({ role: 'organizer' });
  if (!organizer) {
    organizer = await User.findOne({});
  }

  const userId = organizer ? organizer._id.toString() : new mongoose.Types.ObjectId().toString();
  const userName = organizer ? organizer.name : 'Test Organizer';

  // Clean up any existing test bookings for 2026-09-04
  await Booking.deleteMany({ date: '2026-09-04' });

  // 2. Create Booking A on 4th Floor, 5:00 PM - 6:00 PM (17:00 - 18:00) with 10 phones
  const bookingA = await Booking.create({
    bookingRef: `TEST-BK-A-${Date.now().toString().slice(-5)}`,
    eventName: '4th Floor Conference',
    purpose: 'Quarterly Review',
    expectedAttendance: 50,
    organiser: {
      userId: userId,
      name: userName,
      department: 'Engineering',
      email: 'test@example.com',
      mobile: '1234567890',
    },
    floor: '4th_floor',
    date: '2026-09-04',
    startTime: '17:00',
    endTime: '18:00',
    resources: [
      {
        resource: phone._id,
        name: phone.name,
        quantity: 10,
      },
    ],
    status: 'pending_approval',
    createdBy: userId,
  });
  console.log(`[PASS 2] Booking A created on 4th Floor: 17:00-18:00, 10 phones. Status=${bookingA.status}`);

  // 3. Check availability for 3rd floor booking from 17:00 to 18:00
  const availExactOverlap = await getResourceAvailability({ resource: phone, date: '2026-09-04', startTime: '17:00', endTime: '18:00' });
  console.log(`[PASS 3] 3rd Floor exact overlap (17:00 - 18:00): available = ${availExactOverlap.available}, reserved = ${availExactOverlap.reserved}`);
  if (availExactOverlap.available !== 10 || availExactOverlap.reserved !== 10) {
    throw new Error(`Expected 10 available, got ${availExactOverlap.available}`);
  }

  // 4. Check catalog for 3rd floor from 17:00 to 18:00
  const catalog = await resourceService.getCatalog({ floor: 'third', date: '2026-09-04', start: '17:00', end: '18:00' });
  const phoneInCatalog = catalog.find(r => r.resourceId === phone._id.toString());
  console.log(`[PASS 4] Catalog for 3rd Floor: phone available = ${phoneInCatalog.available}, total = ${phoneInCatalog.total}`);
  if (phoneInCatalog.available !== 10) {
    throw new Error(`Expected catalog available 10, got ${phoneInCatalog.available}`);
  }

  // 5. Check non-overlapping slot (18:00 - 19:00) on 3rd floor
  const availNonOverlap = await getResourceAvailability({ resource: phone, date: '2026-09-04', startTime: '18:00', endTime: '19:00' });
  console.log(`[PASS 5] 3rd Floor non-overlap (18:00 - 19:00): available = ${availNonOverlap.available}, reserved = ${availNonOverlap.reserved}`);
  if (availNonOverlap.available !== 20 || availNonOverlap.reserved !== 0) {
    throw new Error(`Expected 20 available, got ${availNonOverlap.available}`);
  }

  // 6. Check partial overlap slot (16:00 - 17:30) on 3rd floor
  const availPartialOverlap = await getResourceAvailability({ resource: phone, date: '2026-09-04', startTime: '16:00', endTime: '17:30' });
  console.log(`[PASS 6] 3rd Floor partial overlap (16:00 - 17:30): available = ${availPartialOverlap.available}, reserved = ${availPartialOverlap.reserved}`);
  if (availPartialOverlap.available !== 10) {
    throw new Error(`Expected 10 available, got ${availPartialOverlap.available}`);
  }

  // 7. Validate resource reservation request of 15 phones on 3rd floor (17:00 - 18:00) -> Should fail overbooking
  const checkInvalid = await validateResources({
    floor: 'third',
    date: '2026-09-04',
    startTime: '17:00',
    endTime: '18:00',
    requestedResources: [{ resourceId: phone._id.toString(), quantity: 15 }],
  });
  console.log(`[PASS 7] Overbooking check: ok = ${checkInvalid.ok}, error message: "${checkInvalid.errors[0]?.message}"`);
  if (checkInvalid.ok || !checkInvalid.errors[0]?.message?.includes('Only 10 phone are available')) {
    throw new Error(`Expected overbooking error message, but got: ${checkInvalid.errors[0]?.message}`);
  }

  // 8. Validate resource reservation request of 10 phones on 3rd floor (17:00 - 18:00) -> Should succeed
  const checkValid = await validateResources({
    floor: 'third',
    date: '2026-09-04',
    startTime: '17:00',
    endTime: '18:00',
    requestedResources: [{ resourceId: phone._id.toString(), quantity: 10 }],
  });
  console.log(`[PASS 8] Valid booking of 10 phones passed: ok = ${checkValid.ok}, lines count = ${checkValid.lines.length}`);
  if (!checkValid.ok) {
    throw new Error(`Expected validation to pass, but got errors: ${JSON.stringify(checkValid.errors)}`);
  }

  // 9. Reject Booking A and verify units are immediately returned
  bookingA.status = 'rejected';
  bookingA.statusHistory.push({ status: 'rejected', at: new Date(), by: userName });
  await bookingA.save();

  const availAfterRejection = await getResourceAvailability({ resource: phone, date: '2026-09-04', startTime: '17:00', endTime: '18:00' });
  console.log(`[PASS 9] After rejecting Booking A: available = ${availAfterRejection.available}, reserved = ${availAfterRejection.reserved}`);
  if (availAfterRejection.available !== 20 || availAfterRejection.reserved !== 0) {
    throw new Error(`Expected 20 available after rejection, got ${availAfterRejection.available}`);
  }

  // Clean up test booking
  await Booking.deleteOne({ _id: bookingA._id });

  console.log('=== ALL 9 SHARED INVENTORY TESTS PASSED SUCCESSFULLY! ===');
  await mongoose.disconnect();
}

runTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
