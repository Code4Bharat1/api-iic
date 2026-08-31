const mongoose = require('mongoose');
const { BOOKING_STATUS, CLOSURE_CHECKLIST_ITEMS } = require('../utils/constants');

const bookingResourceSchema = new mongoose.Schema(
  {
    resource: { type: mongoose.Schema.Types.ObjectId, ref: 'Resource', required: true },
    name: { type: String, required: true },
    unitType: { type: String, enum: ['quantity', 'toggle'], default: 'quantity' },
    quantity: { type: Number, default: 0 }, // for toggle type, 1 = requested
  },
  { _id: false }
);

const statusHistoryEntrySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, default: Date.now },
    by: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const checklistDefaults = {};
CLOSURE_CHECKLIST_ITEMS.forEach((item) => {
  checklistDefaults[item.key] = false;
});

const closureSchema = new mongoose.Schema(
  {
    checklist: { type: Object, default: () => ({ ...checklistDefaults }) },
    photos: { type: Object, default: () => ({}) }, // { categoryKey: [ '/uploads/xxx.jpg' ] }
    submittedAt: { type: Date },
    submittedBy: { type: String },
    verifiedAt: { type: Date },
    verifiedBy: { type: String },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, required: true, unique: true },

    eventName: { type: String, required: true },
    purpose: { type: String, required: true },
    expectedAttendance: { type: Number, required: true },

    organiser: {
      name: { type: String, required: true },
      userId: { type: String, required: true },
      department: { type: String, default: '' },
      mobile: { type: String, default: '' },
      email: { type: String, default: '' },
    },

    floor: { type: String, required: true }, // floor key
    date: { type: String, required: true }, // YYYY-MM-DD
    startTime: { type: String, required: true }, // HH:mm
    endTime: { type: String, required: true }, // HH:mm

    resources: { type: [bookingResourceSchema], default: [] },
    specialRequirements: { type: String, default: '' },

    arrangementContact: { type: mongoose.Schema.Types.ObjectId, ref: 'Contact' },

    status: { type: String, enum: Object.values(BOOKING_STATUS), default: BOOKING_STATUS.PENDING_APPROVAL },
    statusHistory: { type: [statusHistoryEntrySchema], default: [] },

    adminComment: { type: String, default: '' }, // change-request comment
    rejectionReason: { type: String, default: '' },

    conflictOverride: {
      overridden: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      by: { type: String, default: '' },
      at: { type: Date },
    },

    closure: { type: closureSchema, default: () => ({}) },

    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
