/**
 * scripts/testResourceFlow.js
 * End-to-end validation of the complete Resource Management ↔ Booking lifecycle.
 */
const BASE_URL = 'http://localhost:5244/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function run() {
  console.log('--- STARTING COMPLETE RESOURCE FLOW TEST ---');

  // 1. Login as Admin
  console.log('\n[1] Logging in as Admin...');
  const adminLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'admin@iic.org', password: 'Admin@123' }),
  });
  if (!adminLogin.ok) throw new Error('Admin login failed: ' + JSON.stringify(adminLogin.data));
  const adminToken = adminLogin.data.token;
  const adminHeaders = { Authorization: `Bearer ${adminToken}` };
  console.log('  Admin login SUCCESS');

  // 2. Login as Organiser
  console.log('\n[2] Logging in as Organiser...');
  const orgLogin = await request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier: 'organiser@iic.org', password: 'Organiser@123' }),
  });
  if (!orgLogin.ok) throw new Error('Organiser login failed: ' + JSON.stringify(orgLogin.data));
  const orgToken = orgLogin.data.token;
  const orgHeaders = { Authorization: `Bearer ${orgToken}` };
  console.log('  Organiser login SUCCESS');

  // Pre-test cleanup: reject any existing booking on testDate and remove test resources
  console.log('\n[Pre-test] Cleaning up any prior test artifacts...');
  const existingBookings = await request('/bookings?date=2026-10-15', { headers: adminHeaders });
  if (existingBookings.ok && Array.isArray(existingBookings.data)) {
    for (const b of existingBookings.data) {
      await request(`/bookings/${b._id}/reject`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ reason: 'Pre-test cleanup' }),
      });
    }
  }
  const existingResources = await request('/resources?search=HD Projector', { headers: adminHeaders });
  if (existingResources.ok && Array.isArray(existingResources.data)) {
    for (const r of existingResources.data) {
      await request(`/resources/${r._id}`, { method: 'DELETE', headers: adminHeaders });
    }
  }

  // 3. Admin creates resource: "HD Projector" on 2nd Floor, totalQuantity: 5
  console.log('\n[3] Admin creates "HD Projector" on second floor (total: 5, active: true)...');
  const createRes = await request('/resources', {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      name: 'HD Projector',
      category: 'Electronics',
      floor: 'second',
      unitType: 'quantity',
      totalQuantity: 5,
      notes: 'High brightness projector',
    }),
  });
  if (!createRes.ok) throw new Error('Create resource failed: ' + JSON.stringify(createRes.data));
  const testResourceId = createRes.data._id;
  console.log(`  Created resource with ID: ${testResourceId}`);

  const testDate = '2026-10-15';
  const slotStart = '10:00';
  const slotEnd = '12:00';

  // 4. Organiser queries catalog for 2nd floor on testDate 10:00-12:00
  console.log('\n[4] Organiser queries catalog for 2nd floor...');
  let catRes = await request(`/resources/catalog?floor=second&date=${testDate}&start=${slotStart}&end=${slotEnd}`, {
    headers: orgHeaders,
  });
  let item = catRes.data.find((r) => r.resourceId === testResourceId);
  if (!item || item.available !== 5) {
    throw new Error(`Expected HD Projector available: 5, but got: ${JSON.stringify(item)}`);
  }
  console.log(`  PASSED: Organiser dynamically sees "${item.name}" with available: ${item.available}`);

  // 5. Admin updates total quantity: 5 -> 10
  console.log('\n[5] Admin updates total quantity from 5 to 10...');
  const updateRes = await request(`/resources/${testResourceId}`, {
    method: 'PUT',
    headers: adminHeaders,
    body: JSON.stringify({
      totalQuantity: 10,
      reason: 'Additional stock arrived',
    }),
  });
  if (!updateRes.ok) throw new Error('Update quantity failed: ' + JSON.stringify(updateRes.data));

  catRes = await request(`/resources/catalog?floor=second&date=${testDate}&start=${slotStart}&end=${slotEnd}`, {
    headers: orgHeaders,
  });
  item = catRes.data.find((r) => r.resourceId === testResourceId);
  if (!item || item.available !== 10) {
    throw new Error(`Expected HD Projector available: 10, but got: ${JSON.stringify(item)}`);
  }
  console.log(`  PASSED: Organiser dynamically sees updated available: ${item.available}`);

  // 6. Admin disables resource (active: false)
  console.log('\n[6] Admin disables resource...');
  const disableRes = await request(`/resources/${testResourceId}/status`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ active: false, reason: 'Maintenance' }),
  });
  if (!disableRes.ok) throw new Error('Disable resource failed: ' + JSON.stringify(disableRes.data));

  catRes = await request(`/resources/catalog?floor=second&date=${testDate}&start=${slotStart}&end=${slotEnd}`, {
    headers: orgHeaders,
  });
  item = catRes.data.find((r) => r.resourceId === testResourceId);
  if (item) {
    throw new Error('Expected disabled resource to be omitted from catalog, but it was found!');
  }
  console.log('  PASSED: Disabled resource is completely hidden from Organiser booking catalog');

  // 7. Admin re-enables resource (active: true)
  console.log('\n[7] Admin re-enables resource...');
  const enableRes = await request(`/resources/${testResourceId}/status`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ active: true, reason: 'Maintenance finished' }),
  });
  if (!enableRes.ok) throw new Error('Enable resource failed: ' + JSON.stringify(enableRes.data));

  catRes = await request(`/resources/catalog?floor=second&date=${testDate}&start=${slotStart}&end=${slotEnd}`, {
    headers: orgHeaders,
  });
  item = catRes.data.find((r) => r.resourceId === testResourceId);
  if (!item || item.available !== 10) {
    throw new Error(`Expected re-enabled resource with available: 10, got: ${JSON.stringify(item)}`);
  }
  console.log(`  PASSED: Re-enabled resource reappears with available: ${item.available}`);

  // 8. Organiser creates booking requesting 4 HD Projectors for 10:00-12:00
  console.log('\n[8] Organiser submits booking requesting 4 units...');
  const bookingRes = await request('/bookings', {
    method: 'POST',
    headers: orgHeaders,
    body: JSON.stringify({
      eventName: 'Projector Test Symposium',
      purpose: 'Testing resource reservation lifecycle',
      expectedAttendance: 50,
      organiser: {
        name: 'Event Organiser',
        userId: 'ORG-1001',
        department: 'Research Cell',
        mobile: '+91 90000 00001',
        email: 'organiser@iic.org',
      },
      floor: 'second',
      date: testDate,
      startTime: slotStart,
      endTime: slotEnd,
      resources: [{ resourceId: testResourceId, quantity: 4 }],
    }),
  });
  if (!bookingRes.ok) throw new Error('Create booking failed: ' + JSON.stringify(bookingRes.data));
  const createdBookingId = bookingRes.data._id;
  console.log(`  Created booking: ${bookingRes.data.bookingRef}`);

  // 9. Check availability for the same slot: should be 10 - 4 = 6
  console.log('\n[9] Checking available quantity for conflicting slot (10:00-12:00)...');
  catRes = await request(`/resources/catalog?floor=second&date=${testDate}&start=${slotStart}&end=${slotEnd}`, {
    headers: orgHeaders,
  });
  item = catRes.data.find((r) => r.resourceId === testResourceId);
  if (!item || item.available !== 6 || item.reserved !== 4) {
    throw new Error(`Expected available: 6, reserved: 4, but got: ${JSON.stringify(item)}`);
  }
  console.log(`  PASSED: Dynamic calculation verified -> Total: ${item.total}, Reserved: ${item.reserved}, Available: ${item.available}`);

  // 10. Check availability for an independent slot (14:00-16:00): should still be full 10
  console.log('\n[10] Checking available quantity for independent slot (14:00-16:00)...');
  const indepCat = await request(`/resources/catalog?floor=second&date=${testDate}&start=14:00&end=16:00`, {
    headers: orgHeaders,
  });
  const indepItem = indepCat.data.find((r) => r.resourceId === testResourceId);
  if (!indepItem || indepItem.available !== 10) {
    throw new Error(`Expected independent slot available: 10, but got: ${JSON.stringify(indepItem)}`);
  }
  console.log(`  PASSED: Independent slot remains fully available (${indepItem.available} units)`);

  // 11. Backend prevents overbooking: Attempt reserving 15 units in the 14:00-16:00 slot (only 10 available)
  console.log('\n[11] Testing backend overbooking prevention (requesting 15 units when only 10 available)...');
  const overbookRes = await request('/bookings', {
    method: 'POST',
    headers: orgHeaders,
    body: JSON.stringify({
      eventName: 'Overbooking Attempt',
      purpose: 'Should fail',
      expectedAttendance: 20,
      organiser: {
        name: 'Event Organiser',
        userId: 'ORG-1001',
      },
      floor: 'second',
      date: testDate,
      startTime: '14:00',
      endTime: '16:00',
      resources: [{ resourceId: testResourceId, quantity: 15 }],
    }),
  });
  if (overbookRes.status === 409 && overbookRes.data?.resourceConflict) {
    console.log(`  PASSED: Backend successfully rejected overbooking with 409 Conflict: ${overbookRes.data.errors?.[0]?.message}`);
  } else {
    throw new Error(`Expected 409 Conflict, but got status ${overbookRes.status}: ${JSON.stringify(overbookRes.data)}`);
  }

  // 12. Test resource deletion blocking when upcoming booking exists
  console.log('\n[12] Testing deletion block when resource has upcoming reservations...');
  const blockDelRes = await request(`/resources/${testResourceId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (!blockDelRes.ok && blockDelRes.status === 400) {
    console.log(`  PASSED: Deletion blocked as expected: ${blockDelRes.data.message}`);
  } else {
    throw new Error('Expected deletion to be blocked due to active booking, but got: ' + JSON.stringify(blockDelRes.data));
  }

  // 13. Clean up: reject/cancel the test booking and delete the test resource
  console.log('\n[13] Cleaning up test booking and deleting test resource...');
  await request(`/bookings/${createdBookingId}/reject`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({ reason: 'Test complete' }),
  });

  // Verify that rejected booking releases the inventory
  catRes = await request(`/resources/catalog?floor=second&date=${testDate}&start=${slotStart}&end=${slotEnd}`, {
    headers: orgHeaders,
  });
  item = catRes.data.find((r) => r.resourceId === testResourceId);
  if (!item || item.available !== 10) {
    throw new Error(`Expected full 10 units released after rejection, got: ${JSON.stringify(item)}`);
  }
  console.log('  PASSED: Rejected booking released all reserved inventory');

  const finalDel = await request(`/resources/${testResourceId}`, {
    method: 'DELETE',
    headers: adminHeaders,
  });
  if (!finalDel.ok) throw new Error('Final delete failed: ' + JSON.stringify(finalDel.data));
  console.log(`  PASSED: Test resource deleted cleanly: ${finalDel.data.message}`);

  console.log('\n=============================================');
  console.log('ALL RESOURCE LIFECYCLE TESTS PASSED PERFECTLY!');
  console.log('=============================================\n');
}

run().catch((err) => {
  console.error('\nTEST FAILED:', err.message);
  process.exit(1);
});
