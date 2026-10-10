const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const Invoice = require('../models/Invoice');

// PUBLIC route (no login): lets a customer check that an invoice is real.
// It shows only what is needed to compare with the paper invoice. No phone number,
// no unit prices, no payment proof, nothing about the owner's share.
router.use(rateLimit({ windowMs: 60 * 1000, max: 30, message: { message: 'Too many checks. Please try again in a minute' } }));

// "Ali Raza" -> "Ali R."
const maskName = (name = '') => {
  const [first, ...rest] = name.trim().split(/\s+/);
  return [first, ...rest.map((w) => `${w[0]}.`)].join(' ');
};

router.get('/:code', async (req, res, next) => {
  try {
    const code = String(req.params.code).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 12) return res.status(404).json({ message: 'No invoice matches this code' });

    const inv = await Invoice.findOne({ verifyCode: code }).populate('createdBy', 'name');
    if (!inv) return res.status(404).json({ message: 'No invoice matches this code' });

    res.json({
      cancelled: inv.isDeleted === true,
      invoiceNo: inv.invoiceNo,
      date: inv.orderDate,
      customer: maskName(inv.customer.name),
      items: inv.items.map((i) => ({ name: i.name, quantity: i.quantity })),
      grandTotal: inv.grandTotal,
      amountPaid: inv.amountPaid,
      balance: inv.balance,
      status: inv.status,
      deliveryStatus: inv.deliveryStatus,
      deliveredAt: inv.deliveredAt,
      handledBy: inv.createdBy?.name || inv.createdByName,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;