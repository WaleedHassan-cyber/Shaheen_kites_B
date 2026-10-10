const mongoose = require('mongoose');

// Every change to stock is written here, so the owner can always see why a number moved.
const schema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    productName: String,
    change: { type: Number, required: true }, // + added, - sold
    type: { type: String, enum: ['add', 'sale', 'void', 'adjust'], required: true },
    invoiceNo: String,
    note: { type: String, default: '' },
    byName: String,
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StockMovement', schema);
