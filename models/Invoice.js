const mongoose = require('mongoose');

// Price and name are copied onto each line so old invoices never change
// when the admin edits prices later.
const itemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    officialPrice: { type: Number, required: true, min: 0 }, // price list at the time of sale
    unitPrice: { type: Number, required: true, min: 0 }, // price the customer pays
    ownerLine: { type: Number, default: 0 }, // owner's share of this line
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true, unique: true },
    customer: { name: { type: String, required: true, trim: true }, phone: { type: String, trim: true, default: '' } },
    orderDate: { type: Date, required: true, default: Date.now },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    subtotal: { type: Number, required: true },
    discountType: { type: String, enum: ['flat', 'percent'], default: 'flat' },
    discountValue: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },
    amountPaid: { type: Number, required: true, min: 0 },
    balance: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ['paid', 'partial', 'unpaid'], required: true },
    paymentProof: { publicId: { type: String, required: true }, originalName: String, mimeType: String },
    // Name copied at creation so the invoice still shows who made it even if that account is ever removed.
    createdByName: { type: String, default: '' },
    ownerAmount: { type: Number, default: 0 }, // owner's share (official prices for staff sales)
    staffProfit: { type: Number, default: 0 }, // amount above the official prices, kept by the team member
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdByRole: { type: String, enum: ['admin', 'staff'], default: 'staff' },
    // Deleting never erases the record. It is marked deleted, stock goes back, and it
    // leaves every total. The number is never reused, so numbering stays in order.
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: Date,
    deletedByName: String,
  },
  { timestamps: true }
);

invoiceSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
