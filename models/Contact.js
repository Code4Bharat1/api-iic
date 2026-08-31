const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    role: { type: String, default: '' }, // role / department
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Contact', contactSchema);
