const mongoose = require('mongoose');

const historyEntrySchema = new mongoose.Schema(
  {
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: true },
    oldQuantity: { type: Number },
    newQuantity: { type: Number },
    changedBy: { type: String },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const resourceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    category: { type: String, required: true }, // Seating, Furniture, Electronics, Audio, Other
    floor: { type: String, required: true }, // floor key this inventory belongs to
    unitType: { type: String, enum: ['quantity', 'toggle'], default: 'quantity' },
    totalQuantity: { type: Number, default: 1 }, // for toggle type: 1 = the single unit (TV) exists
    active: { type: Boolean, default: true },
    notes: { type: String, default: '' },
    history: { type: [historyEntrySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Resource', resourceSchema);
