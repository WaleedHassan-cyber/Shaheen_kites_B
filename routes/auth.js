const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

router.post('/login', async (req, res, next) => {
  try {
    const { username = '', password = '' } = req.body;
    const user = await User.findOne({ username: username.toLowerCase().trim() }).select('+password');
    if (!user || !user.isActive || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Wrong username or password' });
    }
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (e) {
    next(e);
  }
});

router.get('/me', protect, (req, res) => res.json(req.user));

module.exports = router;
