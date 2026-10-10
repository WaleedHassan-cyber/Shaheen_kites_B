const router = require('express').Router();
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

router.get('/', async (req, res, next) => {
  try {
    const [users, profits] = await Promise.all([
      User.find({ role: 'staff' }).sort('-createdAt'),
      Invoice.aggregate([
        { $match: { isDeleted: { $ne: true }, createdByRole: 'staff' } },
        { $group: { _id: '$createdBy', profit: { $sum: '$staffProfit' }, invoices: { $sum: 1 } } },
      ]),
    ]);
    const by = Object.fromEntries(profits.map((p) => [String(p._id), p]));
    // profit = lifetime total the member earned above the official prices
    res.json(users.map((u) => ({ ...u.toJSON(), profit: by[String(u._id)]?.profit || 0, invoices: by[String(u._id)]?.invoices || 0 })));
  } catch (e) {
    next(e);
  }
});

// Admin registers team members. There is no public sign-up.
router.post('/', async (req, res, next) => {
  try {
    const { name, username, password } = req.body;
    if (!name?.trim() || !username?.trim() || !password || password.length < 6) {
      return res.status(400).json({ message: 'Name, username and a password of at least 6 characters are required' });
    }
    if (!/^[a-z0-9._-]{3,30}$/i.test(username.trim())) {
      return res.status(400).json({ message: 'Username can use letters, numbers, dot, dash and underscore (3 to 30 characters, no spaces)' });
    }
    if (await User.findOne({ username: username.toLowerCase().trim() })) {
      return res.status(409).json({ message: 'This username is already taken' });
    }
    const user = await User.create({ name, username, password, role: 'staff' });
    res.status(201).json(user);
  } catch (e) {
    next(e);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.params.id, role: 'staff' });
    if (!user) return res.status(404).json({ message: 'Team member not found' });
    const { name, isActive, password } = req.body;
    if (name?.trim()) user.name = name.trim();
    if (typeof isActive === 'boolean') user.isActive = isActive;
    if (password) {
      if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' });
      user.password = password;
    }
    await user.save();
    res.json(user);
  } catch (e) {
    next(e);
  }
});

module.exports = router;
