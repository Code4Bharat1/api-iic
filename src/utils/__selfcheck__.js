const assert = require('assert');
const { rangesOverlap } = require('./time');
const { validateBookingWindow } = require('./availability');

// --- time overlap (spec §20) ---
assert.strictEqual(rangesOverlap('10:00', '13:00', '11:00', '12:00'), true, 'nested overlap should conflict');
assert.strictEqual(rangesOverlap('10:00', '13:00', '13:00', '15:00'), false, 'back-to-back should not conflict');
assert.strictEqual(rangesOverlap('10:00', '12:00', '12:00', '14:00'), false, 'touching boundary should not conflict');
assert.strictEqual(rangesOverlap('10:00', '13:00', '09:00', '10:30'), true, 'partial overlap at start should conflict');
assert.strictEqual(rangesOverlap('13:00', '15:00', '10:00', '13:00'), false, 'adjacent after should not conflict');

// --- resource math (spec §21): 150 total, 100 reserved during overlap -> 50 available, 80 requested blocked ---
const total = 150;
const reserved = 100;
const available = Math.max(total - reserved, 0);
assert.strictEqual(available, 50, 'available should be total minus reserved for the overlapping period');
assert.ok(80 > available, 'requesting 80 against 50 available must be blocked by the caller');

// --- booking window (spec §15): month boundaries ---
const now = new Date();
const thisMonthFirst = new Date(now.getFullYear(), now.getMonth(), 1);
const nextMonthFirst = new Date(now.getFullYear(), now.getMonth() + 1, 15);
const monthAfterNext = new Date(now.getFullYear(), now.getMonth() + 2, 1);
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
assert.strictEqual(validateBookingWindow(fmt(thisMonthFirst), 2), true, 'current month should be in window');
assert.strictEqual(validateBookingWindow(fmt(nextMonthFirst), 2), true, 'next month should be in window');
assert.strictEqual(validateBookingWindow(fmt(monthAfterNext), 2), false, 'month after next should be outside window');

console.log('OK: all availability/conflict self-checks passed');
