const router = require('express').Router();
const Invoice = require('../models/Invoice');
const Product = require('../models/Product');
const Counter = require('../models/Counter');
const StockMovement = require('../models/StockMovement');
const { protect, adminOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { uploadProof, removeProof, signedUrl } = require('../config/cloudinary');
const { priceInvoice, bad } = require('../utils/pricing');

router.use(protect);

const isAdmin = (req) => req.user.role === 'admin';
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Staff only ever see their own invoices that are not deleted.
const scope = (req) => (isAdmin(req) ? {} : { createdBy: req.user._id, isDeleted: { $ne: true } });
// Staff never receive the official price, the owner's share or the staff profit.
const hideCost = (req) => (isAdmin(req) ? {} : { 'items.officialPrice': 0, 'items.ownerLine': 0, ownerAmount: 0, staffProfit: 0 });
const putBack = (lines) => Promise.all(lines.map((l) => Product.updateOne({ _id: l.product }, { $inc: { stock: l.quantity } })));

async function nextInvoiceNo() {
  const c = await Counter.findOneAndUpdate({ _id: 'invoice' }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return { seq: c.seq, no: `${process.env.INVOICE_PREFIX || 'SLK'}-${String(c.seq).padStart(4, '0')}` };
}

/* ---------- Create ---------- */
router.post('/', upload.single('paymentProof'), async (req, res, next) => {
  let reserved = [], proof, seq, saved = false;
  try {
    const { customerName, customerPhone = '', orderDate } = req.body;
    if (!customerName?.trim()) throw bad('Customer name is required');
    if (!req.file) throw bad('Payment proof is required. Upload the screenshot or receipt');

    let raw;
    try { raw = JSON.parse(req.body.items || '[]'); } catch { raw = []; }
    if (!Array.isArray(raw) || raw.length === 0) throw bad('Add at least one item');

    const asked = {};
    for (const r of raw) {
      const q = Number(r.quantity);
      if (!r.productId || !Number.isInteger(q) || q < 1) throw bad('Each item needs a whole-number quantity of 1 or more');
      if (asked[r.productId]) throw bad('Each item can only be added once');
      asked[r.productId] = { quantity: q, price: r.unitPrice === undefined || r.unitPrice === '' ? null : Number(r.unitPrice) };
    }
    const products = await Product.find({ _id: { $in: Object.keys(asked) }, isActive: true });
    if (products.length !== Object.keys(asked).length) throw bad('One of the items is no longer available');

    const math = priceInvoice({
      products, asked, role: req.user.role,
      discountType: req.body.discountType === 'percent' ? 'percent' : 'flat',
      discountValue: Number(req.body.discountValue || 0),
      amountPaid: Number(req.body.amountPaid || 0),
    });

    const date = orderDate ? new Date(orderDate) : new Date();
    if (isNaN(date)) throw bad('Order date is not valid');

    // Take the kites out of stock. The $gte check makes it impossible to sell more than we have,
    // even if two people save at the same moment.
    for (const it of math.items) {
      const r = await Product.updateOne({ _id: it.product, stock: { $gte: it.quantity } }, { $inc: { stock: -it.quantity } });
      if (r.modifiedCount !== 1) {
        const cur = await Product.findById(it.product).select('stock');
        throw bad(`Only ${cur?.stock || 0} ${it.name} left in stock`);
      }
      reserved.push(it);
    }

    try {
      const up = await uploadProof(req.file.buffer);
      proof = { publicId: up.public_id, originalName: req.file.originalname, mimeType: req.file.mimetype };
    } catch (err) {
      console.error('Cloudinary upload failed:', err.message);
      throw bad('Could not upload the payment proof. Please try again', 502);
    }

    const num = await nextInvoiceNo();
    seq = num.seq;
    const invoice = await Invoice.create({
      ...math,
      invoiceNo: num.no,
      customer: { name: customerName.trim(), phone: customerPhone.trim() },
      orderDate: date,
      paymentProof: proof,
      createdBy: req.user._id,
      createdByName: req.user.name,
      createdByRole: req.user.role,
    });
    saved = true;

    await StockMovement.insertMany(
      math.items.map((i) => ({ product: i.product, productName: i.name, change: -i.quantity, type: 'sale', invoiceNo: num.no, byName: req.user.name, by: req.user._id }))
    ).catch((e) => console.error('Stock log failed:', e.message));

    await invoice.populate('createdBy', 'name username');
    const out = invoice.toObject();
    if (!isAdmin(req)) {
      delete out.ownerAmount;
      delete out.staffProfit;
      out.items.forEach((i) => { delete i.officialPrice; delete i.ownerLine; });
    }
    res.status(201).json(out);
  } catch (e) {
    // Undo everything this request did, but only if the invoice itself was not saved.
    if (!saved) {
      if (reserved.length) await putBack(reserved).catch(() => {});
      if (proof) await removeProof(proof.publicId);
      if (seq) await Counter.updateOne({ _id: 'invoice', seq }, { $inc: { seq: -1 } }).catch(() => {});
    }
    next(e);
  }
});

/* ---------- List (search + filters) ---------- */
router.get('/', async (req, res, next) => {
  try {
    const { search, status, staff, from, to } = req.query;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 15);

    const q = scope(req);
    if (isAdmin(req)) q.isDeleted = req.query.deleted === 'true' ? true : { $ne: true };
    if (['paid', 'partial', 'unpaid'].includes(status)) q.status = status;
    if (staff && isAdmin(req)) q.createdBy = staff;
    if (from || to) {
      q.orderDate = {};
      if (from) q.orderDate.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) q.orderDate.$lte = new Date(`${to}T23:59:59.999Z`);
    }
    if (search?.trim()) {
      const r = new RegExp(escapeRegex(search.trim()), 'i');
      q.$or = [{ invoiceNo: r }, { 'customer.name': r }, { 'customer.phone': r }];
    }

    const [invoices, total] = await Promise.all([
      Invoice.find(q, hideCost(req)).sort('-createdAt').skip((page - 1) * limit).limit(limit).populate('createdBy', 'name username'),
      Invoice.countDocuments(q),
    ]);
    res.json({ invoices, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (e) {
    next(e);
  }
});

/* ---------- Single invoice + payment proof ---------- */
router.get('/:id/proof', async (req, res, next) => {
  try {
    const inv = await Invoice.findOne({ _id: req.params.id, ...scope(req) });
    if (!inv?.paymentProof?.publicId) return res.status(404).json({ message: 'No payment proof for this invoice' });
    res.json({ url: signedUrl(inv.paymentProof.publicId) });
  } catch (e) {
    next(e);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const inv = await Invoice.findOne({ _id: req.params.id, ...scope(req) }, hideCost(req)).populate('createdBy', 'name username');
    if (!inv) return res.status(404).json({ message: 'Invoice not found' });
    res.json(inv);
  } catch (e) {
    next(e);
  }
});

/* ---------- Delete (owner only) ---------- */
// The record and its payment proof are kept for the books. Marking it deleted puts the kites
// back in stock and removes its sales and profit from every total.
router.delete('/:id', adminOnly, async (req, res, next) => {
  try {
    // One atomic flip, so a double click can never put the stock back twice.
    const inv = await Invoice.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true, deletedAt: new Date(), deletedByName: req.user.name } },
      { new: true }
    );
    if (!inv) return res.status(404).json({ message: 'Invoice not found or already deleted' });

    await putBack(inv.items);
    await StockMovement.insertMany(
      inv.items.map((i) => ({ product: i.product, productName: i.name, change: i.quantity, type: 'void', invoiceNo: inv.invoiceNo, byName: req.user.name, by: req.user._id }))
    ).catch((e) => console.error('Stock log failed:', e.message));

    res.json({ message: `${inv.invoiceNo} deleted. Stock restored.` });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
