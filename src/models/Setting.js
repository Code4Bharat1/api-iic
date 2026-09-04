const mongoose = require('mongoose');

// singleton document (findOne, create if missing)
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true },
    bookingWindowMonths: { type: Number, default: 2 }, // current month + N-1 following months
    orgName: { type: String, default: 'IIC Event Management' },
    notifyOnApproval: { type: Boolean, default: true },
    notifyOnClosure: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema);
