const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    bookable: { type: Boolean, default: false },
    interactiveTV: { type: Boolean, default: false },
    micArrangement: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Floor', floorSchema);
