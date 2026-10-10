const router = require('express').Router();
const Product = require('../models/Product');
const StockMovement = require('../models/StockMovement');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

// Stock levels themselves come from GET /api/products (admin sees every item, with stock).
router.get('/movements', async (req, res, next) => {
  try {
    res.json(await StockMovement.find().sort('-createdAt').limit(100));
  } catch (e) {
    next(e);
  }
});

// Add newly bought / received kites to stock.
router.post('/:id/add', async (req, res, next) => {
  try {
    const qty = Number(req.body.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 1000000) return res.status(400).json({ message: 'Enter a whole number of 1 or more' });
    const p = await Product.findByIdAndUpdate(req.params.id, { $inc: { stock: qty } }, { new: true });
    if (!p) return res.status(404).json({ message: 'Item not found' });
    await StockMovement.create({ product: p._id, productName: p.name, change: qty, type: 'add', note: String(req.body.note || '').slice(0, 200), byName: req.user.name, by: req.user._id });
    res.json(p);
  } catch (e) {
    next(e);
  }
});

// Fix the count after a physical count (damaged, lost, counted wrong).
router.post('/:id/adjust', async (req, res, next) => {
  try {
    const stock = Number(req.body.stock);
    if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return res.status(400).json({ message: 'Enter a whole number, 0 or more' });
    const before = await Product.findOneAndUpdate({ _id: req.params.id }, { $set: { stock } }, { new: false });
    if (!before) return res.status(404).json({ message: 'Item not found' });
    const delta = stock - (before.stock || 0);
    if (delta !== 0) {
      await StockMovement.create({ product: before._id, productName: before.name, change: delta, type: 'adjust', note: String(req.body.note || '').slice(0, 200), byName: req.user.name, by: req.user._id });
    }
    res.json(await Product.findById(before._id));
  } catch (e) {
    next(e);
  }
});

module.exports = router;
