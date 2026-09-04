const mongoose = require('mongoose');
const { ISSUE_STATUS, ISSUE_TYPES } = require('../utils/constants');

const issueSchema = new mongoose.Schema(
  {
    issueId: { type: String, required: true, unique: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
    bookingRef: { type: String, required: true },
    resourceName: { type: String, required: true },
    issueType: { type: String, enum: ISSUE_TYPES, required: true },
    description: { type: String, default: '' },
    photos: { type: [String], default: [] },
    status: { type: String, enum: Object.values(ISSUE_STATUS), default: ISSUE_STATUS.OPEN },
    reportedBy: { type: String, required: true },
    reportedAt: { type: Date, default: Date.now },
    resolution: { type: String, default: '' },
    resolvedBy: { type: String, default: '' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Issue', issueSchema);
