const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, enum: ['kite', 'set'], default: 'kite' },
    stock: { type: Number, default: 0, min: 0 }, // changed only by sales, invoice deletes and the Inventory page
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Product', productSchema);
