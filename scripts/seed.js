require('dotenv').config();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

const User = require('../src/models/User');
const Floor = require('../src/models/Floor');
const Resource = require('../src/models/Resource');
const Booking = require('../src/models/Booking');
const Contact = require('../src/models/Contact');
const AuditLog = require('../src/models/AuditLog');
const Notification = require('../src/models/Notification');
const Issue = require('../src/models/Issue');
const Setting = require('../src/models/Setting');

const { FLOORS, BOOKING_STATUS } = require('../src/utils/constants');

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Default dev passwords — override with env vars
const ORGANISER_PASSWORD = process.env.SEED_ORGANISER_PASSWORD || 'Organiser@123';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'Admin@123';
const MASTER_ADMIN_PASSWORD = process.env.SEED_MASTER_ADMIN_PASSWORD || 'MasterAdmin@123';

async function seed() {
  await connectDB();

  await Promise.all(
    [User, Floor, Resource, Booking, Contact, AuditLog, Notification, Issue, Setting].map((m) => m.deleteMany({}))
  );

  await Setting.create({ key: 'global', bookingWindowMonths: 2 });

  const floors = await Floor.insertMany(FLOORS);
  const floorByKey = Object.fromEntries(floors.map((f) => [f.key, f]));

  // Hash passwords for all demo users
  const [organiserHash, adminHash, masterHash] = await Promise.all([
    bcrypt.hash(ORGANISER_PASSWORD, 10),
    bcrypt.hash(ADMIN_PASSWORD, 10),
    bcrypt.hash(MASTER_ADMIN_PASSWORD, 10),
  ]);

  const users = await User.insertMany([
    { userId: 'ORG-1001', name: 'Event Organiser', email: 'organiser@iic.org', mobile: '+91 90000 00001', role: 'organiser', department: 'Research Cell', passwordHash: organiserHash },
    { userId: 'ADM-2001', name: 'IIC Operations Admin', email: 'admin@iic.org', mobile: '+91 90000 00002', role: 'admin', department: 'IIC Operations', passwordHash: adminHash },
    { userId: 'MST-3001', name: 'System Administrator', email: 'master.admin@iic.org', mobile: '+91 90000 00003', role: 'master_admin', department: 'IIC Administration', passwordHash: masterHash },
  ]);
  const organiser = users.find((u) => u.role === 'organiser');

  const contacts = await Contact.insertMany([
    { name: 'Ramesh Kumar', role: 'Facilities Coordinator', phone: '+91 98100 11111', email: 'ramesh.facilities@iic.org' },
    { name: 'Anita Sharma', role: 'AV & Equipment In-charge', phone: '+91 98100 22222', email: 'anita.av@iic.org' },
    { name: 'Suresh Nair', role: 'Housekeeping Supervisor', phone: '+91 98100 33333', email: 'suresh.hk@iic.org' },
  ]);

  const resourceSeed = [];
  const perFloor = { basement: { chairs: 150, tables: 30, mics: 4 }, first: { chairs: 120, tables: 20, mics: 3 }, second: { chairs: 180, tables: 35, mics: 4 } };
  ['basement', 'first', 'second'].forEach((floorKey) => {
    const cfg = perFloor[floorKey];
    resourceSeed.push({ name: 'Chairs', category: 'Seating', floor: floorKey, unitType: 'quantity', totalQuantity: cfg.chairs, history: [{ action: 'Created', newQuantity: cfg.chairs, changedBy: 'System Administrator', reason: 'Initial inventory' }] });
    resourceSeed.push({ name: 'Tables', category: 'Furniture', floor: floorKey, unitType: 'quantity', totalQuantity: cfg.tables, history: [{ action: 'Created', newQuantity: cfg.tables, changedBy: 'System Administrator', reason: 'Initial inventory' }] });
    resourceSeed.push({ name: 'Microphones', category: 'Audio', floor: floorKey, unitType: 'quantity', totalQuantity: cfg.mics, history: [{ action: 'Created', newQuantity: cfg.mics, changedBy: 'System Administrator', reason: 'Initial inventory' }] });
    if (floorByKey[floorKey].interactiveTV) {
      resourceSeed.push({ name: 'Interactive TV', category: 'Electronics', floor: floorKey, unitType: 'toggle', totalQuantity: 1, history: [{ action: 'Created', newQuantity: 1, changedBy: 'System Administrator', reason: 'Initial inventory' }] });
    }
    resourceSeed.push({ name: 'Podium', category: 'Furniture', floor: floorKey, unitType: 'quantity', totalQuantity: 2, history: [{ action: 'Created', newQuantity: 2, changedBy: 'System Administrator', reason: 'Initial inventory' }] });
    resourceSeed.push({ name: 'Extension Boards', category: 'Electronics', floor: floorKey, unitType: 'quantity', totalQuantity: 10, history: [{ action: 'Created', newQuantity: 10, changedBy: 'System Administrator', reason: 'Initial inventory' }] });
  });
  const resources = await Resource.insertMany(resourceSeed);
  const findResource = (floor, name) => resources.find((r) => r.floor === floor && r.name === name);

  const firstFloorChairs = findResource('first', 'Chairs');
  firstFloorChairs.history.push({ action: 'Quantity Updated', oldQuantity: 100, newQuantity: 120, changedBy: 'IIC Operations Admin', reason: 'New inventory received' });
  await firstFloorChairs.save();

  const lines = (floor, spec) =>
    Object.entries(spec)
      .map(([name, quantity]) => {
        const r = findResource(floor, name);
        return r ? { resource: r._id, name: r.name, unitType: r.unitType, quantity } : null;
      })
      .filter(Boolean);

  const bookingsSeed = [
    {
      eventName: 'Annual Research Symposium',
      purpose: 'Institutional research showcase with keynote sessions and poster presentations.',
      expectedAttendance: 180,
      floor: 'second',
      date: todayStr(4),
      startTime: '10:00',
      endTime: '13:00',
      status: BOOKING_STATUS.CONFIRMED,
      resources: lines('second', { Chairs: 80, Tables: 10, 'Interactive TV': 1, Microphones: 2 }),
      contact: contacts[1]._id,
    },
    {
      eventName: 'Faculty Orientation',
      purpose: 'Orientation session for newly joined faculty members.',
      expectedAttendance: 60,
      floor: 'basement',
      date: todayStr(7),
      startTime: '14:00',
      endTime: '16:00',
      status: BOOKING_STATUS.PENDING_APPROVAL,
      resources: lines('basement', { Chairs: 60, Tables: 6, Microphones: 1 }),
    },
    {
      eventName: 'Leadership Workshop',
      purpose: 'Cross-department leadership development workshop.',
      expectedAttendance: 45,
      floor: 'first',
      date: todayStr(8),
      startTime: '09:00',
      endTime: '12:00',
      status: BOOKING_STATUS.CONFIRMED,
      resources: lines('first', { Chairs: 45, Tables: 5, Microphones: 1 }),
      contact: contacts[0]._id,
    },
    {
      eventName: 'Research Committee Meeting',
      purpose: 'Quarterly committee review of ongoing research grants.',
      expectedAttendance: 25,
      floor: 'second',
      date: todayStr(-1),
      startTime: '15:00',
      endTime: '17:00',
      status: BOOKING_STATUS.AWAITING_CLOSURE,
      resources: lines('second', { Chairs: 25, Tables: 4, 'Interactive TV': 1 }),
      contact: contacts[1]._id,
    },
    {
      eventName: 'Training Programme',
      purpose: 'Skill development training for administrative staff.',
      expectedAttendance: 50,
      floor: 'basement',
      date: todayStr(-3),
      startTime: '11:00',
      endTime: '14:00',
      status: BOOKING_STATUS.ISSUE_REPORTED,
      resources: lines('basement', { Chairs: 50, Tables: 5, Microphones: 2 }),
      contact: contacts[2]._id,
    },
    {
      eventName: 'Marketing Workshop',
      purpose: 'Hands-on workshop on institutional outreach and marketing.',
      expectedAttendance: 40,
      floor: 'basement',
      date: todayStr(0),
      startTime: '09:00',
      endTime: '11:00',
      status: BOOKING_STATUS.EVENT_IN_PROGRESS,
      resources: lines('basement', { Chairs: 40, Tables: 4, Microphones: 1 }),
      contact: contacts[0]._id,
    },
    {
      eventName: 'Board Meeting',
      purpose: 'Monthly governing board meeting.',
      expectedAttendance: 18,
      floor: 'second',
      date: todayStr(0),
      startTime: '11:30',
      endTime: '13:30',
      status: BOOKING_STATUS.CONFIRMED,
      resources: lines('second', { Chairs: 18, Tables: 3, 'Interactive TV': 1 }),
      contact: contacts[1]._id,
    },
    {
      eventName: 'Grant Writing Clinic',
      purpose: 'Editing clinic to support faculty grant applications.',
      expectedAttendance: 30,
      floor: 'first',
      date: todayStr(2),
      startTime: '14:00',
      endTime: '17:00',
      status: BOOKING_STATUS.CHANGE_REQUESTED,
      resources: lines('first', { Chairs: 30, Tables: 4 }),
      adminComment: 'Please reduce chair quantity to 20 due to availability with the adjacent event.',
    },
    {
      eventName: 'Alumni Meet Planning',
      purpose: 'Planning session for the upcoming alumni reunion.',
      expectedAttendance: 20,
      floor: 'second',
      date: todayStr(10),
      startTime: '10:00',
      endTime: '12:00',
      status: BOOKING_STATUS.REJECTED,
      rejectionReason: 'Venue reserved for a prior institutional commitment on this date.',
      resources: lines('second', { Chairs: 20, Tables: 2 }),
    },
    {
      eventName: 'Client Demo Day',
      purpose: 'Showcase of incubated startup products to external partners.',
      expectedAttendance: 70,
      floor: 'second',
      date: todayStr(-6),
      startTime: '10:00',
      endTime: '13:00',
      status: BOOKING_STATUS.CLOSED,
      resources: lines('second', { Chairs: 70, Tables: 8, 'Interactive TV': 1, Microphones: 2 }),
      contact: contacts[1]._id,
      closed: true,
    },
  ];

  const createdBookings = [];
  for (const b of bookingsSeed) {
    const statusHistory = [{ status: BOOKING_STATUS.PENDING_APPROVAL, by: organiser.name, note: 'Booking submitted' }];
    if (b.status !== BOOKING_STATUS.PENDING_APPROVAL) statusHistory.push({ status: BOOKING_STATUS.CONFIRMED, by: 'IIC Operations Admin', note: 'Approved by admin' });
    if ([BOOKING_STATUS.EVENT_IN_PROGRESS, BOOKING_STATUS.AWAITING_CLOSURE, BOOKING_STATUS.ISSUE_REPORTED, BOOKING_STATUS.CLOSED].includes(b.status)) {
      statusHistory.push({ status: BOOKING_STATUS.AWAITING_CLOSURE, by: 'system', note: 'Automatic time-based transition' });
    }
    if (b.status === BOOKING_STATUS.CLOSED) statusHistory.push({ status: BOOKING_STATUS.CLOSED, by: 'System Administrator', note: 'Closure verified' });
    if (b.status === BOOKING_STATUS.REJECTED) statusHistory.push({ status: BOOKING_STATUS.REJECTED, by: 'IIC Operations Admin', note: b.rejectionReason });
    if (b.status === BOOKING_STATUS.CHANGE_REQUESTED) statusHistory.push({ status: BOOKING_STATUS.CHANGE_REQUESTED, by: 'IIC Operations Admin', note: b.adminComment });

    const closure = { checklist: {}, photos: {} };
    if (b.status === BOOKING_STATUS.CLOSED) {
      closure.checklist = { floorPhotographed: true, tablesChairsReturned: true, tvPhotographed: true, micPhotographed: true, otherPhotographed: true };
      closure.submittedAt = new Date();
      closure.submittedBy = organiser.name;
      closure.verifiedAt = new Date();
      closure.verifiedBy = 'System Administrator';
    }

    const booking = await Booking.create({
      bookingRef: `IIC-${new Date().getFullYear()}-${String(101 + createdBookings.length).padStart(4, '0')}`,
      eventName: b.eventName,
      purpose: b.purpose,
      expectedAttendance: b.expectedAttendance,
      organiser: { name: organiser.name, userId: organiser.userId, department: organiser.department, mobile: organiser.mobile, email: organiser.email },
      floor: b.floor,
      date: b.date,
      startTime: b.startTime,
      endTime: b.endTime,
      resources: b.resources,
      specialRequirements: b.status === BOOKING_STATUS.CONFIRMED ? 'Please arrange registration desk near the entrance.' : '',
      arrangementContact: b.contact,
      status: b.status,
      statusHistory,
      adminComment: b.adminComment || '',
      rejectionReason: b.rejectionReason || '',
      closure,
      createdBy: organiser.userId,
    });
    createdBookings.push(booking);
  }

  const issueBooking = createdBookings.find((b) => b.eventName === 'Training Programme');
  await Issue.create({
    issueId: 'ISS-0001',
    booking: issueBooking._id,
    bookingRef: issueBooking.bookingRef,
    resourceName: 'Microphones',
    issueType: 'damaged',
    description: 'One handheld microphone was found non-functional after the event.',
    status: 'open',
    reportedBy: 'IIC Operations Admin',
    reportedAt: new Date(),
  });

  await AuditLog.insertMany([
    { userId: 'MST-3001', userName: 'System Administrator', action: 'Approved Booking', entity: 'Booking', entityId: String(createdBookings[0]._id), entityLabel: createdBookings[0].bookingRef },
    { userId: 'ADM-2001', userName: 'IIC Operations Admin', action: 'Updated Resource Quantity', entity: 'Resource', entityId: String(findResource('first', 'Chairs')._id), entityLabel: 'Chairs — 1st Floor', oldValue: '100', newValue: '120', reason: 'New inventory received' },
    { userId: 'ADM-2001', userName: 'IIC Operations Admin', action: 'Requested Changes', entity: 'Booking', entityId: String(createdBookings.find((b) => b.eventName === 'Grant Writing Clinic')._id), entityLabel: createdBookings.find((b) => b.eventName === 'Grant Writing Clinic').bookingRef, reason: 'Please reduce chair quantity to 20 due to availability with the adjacent event.' },
    { userId: 'ADM-2001', userName: 'IIC Operations Admin', action: 'Rejected Booking', entity: 'Booking', entityId: String(createdBookings.find((b) => b.eventName === 'Alumni Meet Planning')._id), entityLabel: createdBookings.find((b) => b.eventName === 'Alumni Meet Planning').bookingRef, reason: 'Venue reserved for a prior institutional commitment on this date.' },
  ]);

  await Notification.insertMany([
    { targetRole: 'admin', type: 'approval_required', message: 'Faculty Orientation requires approval.', bookingRef: createdBookings[1].bookingRef, booking: createdBookings[1]._id },
    { targetUserId: organiser.userId, type: 'change_requested', message: 'Changes requested for Grant Writing Clinic.', bookingRef: createdBookings.find((b) => b.eventName === 'Grant Writing Clinic').bookingRef },
    { targetUserId: organiser.userId, type: 'closure_required', message: 'Research Committee Meeting requires closure.', bookingRef: createdBookings.find((b) => b.eventName === 'Research Committee Meeting').bookingRef },
  ]);

  console.log('\nSeed complete:');
  console.log(`  users: ${users.length}`);
  console.log(`  floors: ${floors.length}`);
  console.log(`  resources: ${resources.length}`);
  console.log(`  bookings: ${createdBookings.length}`);
  console.log('\nDemo login credentials:');
  console.log(`  Organiser  — userId: ORG-1001  password: ${ORGANISER_PASSWORD}`);
  console.log(`  Admin      — userId: ADM-2001  password: ${ADMIN_PASSWORD}`);
  console.log(`  MasterAdmin— userId: MST-3001  password: ${MASTER_ADMIN_PASSWORD}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
