// Run once:  npm run seed
// Creates the admin account (run it on YOUR computer, even for the live database) and default products. Safe to re-run:
// existing products keep their edited prices.
require('dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const connectDB = require('./config/db');
const User = require('./models/User');
const Product = require('./models/Product');

const DEFAULTS = [
  { name: 'Tava', price: 200, unit: 'kite' },
  { name: 'Daid Tava', price: 350, unit: 'kite' },
  { name: 'Ada Pona', price: 130, unit: 'kite' },
  { name: 'Sida', price: 100, unit: 'kite' },
  { name: 'Pinna 2 Piece', price: 8000, unit: 'set' },
  { name: 'Pinna 4 Piece', price: 15000, unit: 'set' },
];

(async () => {
  await connectDB();
  const username = (process.env.ADMIN_USERNAME || '').toLowerCase();
  if (username && process.env.ADMIN_PASSWORD) {
    if (await User.findOne({ username })) console.log(`Admin '${username}' already exists, left unchanged`);
    else {
      await User.create({ name: process.env.ADMIN_NAME || 'Owner', username, password: process.env.ADMIN_PASSWORD, role: 'admin' });
      console.log(`Admin created: ${username}`);
    }
  }
  for (const [i, p] of DEFAULTS.entries()) {
    await Product.updateOne({ name: p.name }, { $setOnInsert: { ...p, sortOrder: i + 1 } }, { upsert: true });
  }
  console.log('Products ready');
  process.exit(0);
})();
