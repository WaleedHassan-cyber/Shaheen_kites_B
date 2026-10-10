require('dns').setServers(['8.8.8.8', '1.1.1.1']);
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const REQUIRED = ['JWT_SECRET', 'MONGO_URI', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missing = REQUIRED.filter((k) => !process.env[k] || process.env[k].startsWith('PASTE_'));
if (missing.length) {
  console.error(`Missing or unfilled in server/.env: ${missing.join(', ')}`);
  process.exit(1);
}

const app = express();
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { message: 'Too many attempts. Try again in 15 minutes' } }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/inventory', require('./routes/inventory'));
app.use('/api/stats', require('./routes/stats'));

// Central error handler
app.use((err, req, res, next) => {
  let status = err.status || 500;
  let message = err.message;
  if (err.name === 'MulterError') {
    status = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be under 5 MB' : err.message;
  } else if (err.name === 'CastError' || err.name === 'ValidationError') status = 400;
  else if (err.code === 11000) { status = 409; message = 'That already exists'; }
  if (status === 500) console.error(err);
  res.status(status).json({ message: status === 500 ? 'Something went wrong on the server' : message });
});

connectDB()
  .then(() => app.listen(process.env.PORT || 5000, () => console.log(`API running on port ${process.env.PORT || 5000}`)))
  .catch((e) => { console.error('Database connection failed:', e.message); process.exit(1); });
