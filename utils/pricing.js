const bad = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * All the money rules for one invoice, in one place.
 *
 *  - Team member: may sell at the official price or higher, never lower.
 *      owner gets   = official price x quantity   (the "base" amount)
 *      staff profit = what the customer pays - base amount
 *  - Owner (admin) selling himself: he keeps the full amount, staff profit is 0.
 *  - A discount comes out of the team member's profit. It can never push the
 *    total below the base amount, so the owner always receives his base amount.
 */
function priceInvoice({ products, asked, role, discountType, discountValue, amountPaid }) {
  const staff = role === 'staff';

  const items = products.map((p) => {
    const { quantity, price } = asked[String(p._id)];
    const unitPrice = price === null ? p.price : price;
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw bad(`Enter a valid price for ${p.name}`);
    if (staff && unitPrice < p.price) throw bad(`${p.name} cannot be sold below Rs. ${p.price}`);
    const lineTotal = unitPrice * quantity;
    return { product: p._id, name: p.name, officialPrice: p.price, unitPrice, quantity, lineTotal, ownerLine: staff ? p.price * quantity : lineTotal };
  });

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const baseTotal = items.reduce((s, i) => s + i.officialPrice * i.quantity, 0);

  if (!Number.isFinite(discountValue) || discountValue < 0) throw bad('Discount cannot be negative');
  if (discountType === 'percent' && discountValue > 100) throw bad('Discount cannot be more than 100%');
  const discountAmount = discountType === 'percent' ? Math.round((subtotal * discountValue) / 100) : discountValue;
  if (discountAmount > subtotal) throw bad('Discount cannot be more than the subtotal');

  const grandTotal = subtotal - discountAmount;
  if (staff && grandTotal < baseTotal) throw bad(`Discount is too high. The most you can give on this sale is Rs. ${subtotal - baseTotal}`);

  if (!Number.isFinite(amountPaid) || amountPaid < 0) throw bad('Amount paid cannot be negative');
  if (amountPaid > grandTotal) throw bad('Amount paid cannot be more than the grand total');
  const balance = grandTotal - amountPaid;

  return {
    items, subtotal, discountType, discountValue, discountAmount, grandTotal, amountPaid, balance,
    status: balance === 0 ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
    ownerAmount: staff ? baseTotal : grandTotal,
    staffProfit: staff ? grandTotal - baseTotal : 0,
  };
}

module.exports = { priceInvoice, bad };
