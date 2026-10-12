const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const Invoice = require('../models/Invoice');
const { protect } = require('../middleware/auth');

// TEAM ONLY (owner and team members). Without a valid login the server answers 401,
// so a customer who scans the QR cannot see any invoice data.
router.use(protect);
router.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    keyGenerator: (req) => String(req.user._id), // counted per person, not per internet address
    message: { message: 'Too many checks. Please try again in a minute' },
  })
);

// Shows only what is needed to match the paper invoice. No phone number, no unit prices,
// no payment proof, nothing about the owner's share or anyone's profit.

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