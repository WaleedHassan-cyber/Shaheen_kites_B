const router = require('express').Router();
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect);

// Staff only see active products; admin sees everything.
router.get('/', async (req, res, next) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { isActive: true };
    res.json(await Product.find(filter).sort({ sortOrder: 1, name: 1 }));
  } catch (e) {
    next(e);
  }
});

router.post('/', adminOnly, async (req, res, next) => {
  try {
    const { name, price, unit } = req.body;
    if (!name?.trim() || !(Number(price) >= 0)) return res.status(400).json({ message: 'Name and a valid price are required' });
    const count = await Product.countDocuments();
    res.status(201).json(await Product.create({ name, price: Number(price), unit, sortOrder: count + 1 }));
  } catch (e) {
    next(e);
  }
});

router.put('/:id', adminOnly, async (req, res, next) => {
  try {
    const update = {};
    if (req.body.price !== undefined) {
      const price = Number(req.body.price);
      if (!Number.isFinite(price) || price < 0) return res.status(400).json({ message: 'Enter a valid price' });
      update.price = price;
    }
    if (typeof req.body.isActive === 'boolean') update.isActive = req.body.isActive;
    if (req.body.name?.trim()) update.name = req.body.name.trim();
    const product = await Product.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json(product);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
