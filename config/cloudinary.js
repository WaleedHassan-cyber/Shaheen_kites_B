const { v2: cloudinary } = require('cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// 'authenticated' = the image has no public link. Only a signed URL made by
// this server (after the login check) can open it.
const OPTS = { folder: 'kite-invoices/payment-proofs', resource_type: 'image', type: 'authenticated' };

const uploadProof = (buffer) =>
  new Promise((resolve, reject) => cloudinary.uploader.upload_stream(OPTS, (err, r) => (err ? reject(err) : resolve(r))).end(buffer));

const signedUrl = (publicId) =>
  cloudinary.url(publicId, { type: 'authenticated', sign_url: true, secure: true, resource_type: 'image' });

const removeProof = (publicId) =>
  cloudinary.uploader.destroy(publicId, { type: 'authenticated', resource_type: 'image' }).catch(() => {});

module.exports = { uploadProof, signedUrl, removeProof };
