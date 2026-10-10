const router = require('express').Router();
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

router.use(protect, adminOnly);

const LOW_STOCK = 10;
const live = { isDeleted: { $ne: true } }; // deleted invoices count in nothing

router.get('/', async (req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 14);

    const [totals] = await Invoice.aggregate([
      { $match: live },
      { $group: { _id: null, revenue: { $sum: '$ownerAmount' }, staffProfit: { $sum: '$staffProfit' }, billed: { $sum: '$grandTotal' }, paid: { $sum: '$amountPaid' }, pending: { $sum: '$balance' }, count: { $sum: 1 } } },
    ]);

    const daily = await Invoice.aggregate([
      { $match: { ...live, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Karachi' } }, revenue: { $sum: '$ownerAmount' }, profit: { $sum: '$staffProfit' } } },
      { $sort: { _id: 1 } },
    ]);

    const byStaff = await Invoice.aggregate([
      { $match: { ...live, createdByRole: 'staff' } },
      { $group: { _id: '$createdBy', snap: { $last: '$createdByName' }, invoices: { $sum: 1 }, billed: { $sum: '$grandTotal' }, ownerAmount: { $sum: '$ownerAmount' }, profit: { $sum: '$staffProfit' }, pending: { $sum: '$balance' } } },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'u' } },
      { $project: { name: { $ifNull: [{ $arrayElemAt: ['$u.name', 0] }, '$snap'] }, invoices: 1, billed: 1, ownerAmount: 1, profit: 1, pending: 1 } },
      { $sort: { profit: -1 } },
    ]);

    const byItem = await Invoice.aggregate([
      { $match: live },
      { $unwind: '$items' },
      { $group: { _id: '$items.name', qty: { $sum: '$items.quantity' }, revenue: { $sum: '$items.ownerLine' } } },
      { $sort: { revenue: -1 } },
    ]);

    const stockRows = await Product.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$unit', total: { $sum: '$stock' }, low: { $sum: { $cond: [{ $lte: ['$stock', LOW_STOCK] }, 1, 0] } } } },
    ]);
    const stock = { kites: 0, sets: 0, low: 0 };
    stockRows.forEach((r) => { stock[r._id === 'set' ? 'sets' : 'kites'] = r.total; stock.low += r.low; });

    res.json({ totals: totals || { revenue: 0, staffProfit: 0, billed: 0, paid: 0, pending: 0, count: 0 }, daily, byStaff, byItem, stock });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
