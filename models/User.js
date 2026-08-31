const mongoose = require('mongoose');
const { ROLES } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true }, // authorised user id / login id
    name: { type: String, required: true },
    email: { type: String, required: true },
    mobile: { type: String, default: '' },
    role: { type: String, enum: ROLES, required: true },
    department: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', userSchema);
