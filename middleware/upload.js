const multer = require('multer');

const OK = ['image/jpeg', 'image/png', 'image/webp'];

// Kept in memory only, then sent straight to Cloudinary. Nothing is written to the server disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) =>
    OK.includes(file.mimetype)
      ? cb(null, true)
      : cb(Object.assign(new Error('Payment proof must be a JPG, PNG or WebP image'), { status: 400 })),
});

module.exports = { upload };
