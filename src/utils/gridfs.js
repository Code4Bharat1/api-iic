const mongoose = require('mongoose');

// Closure and issue-report photos live in MongoDB (GridFS) rather than local
// disk, so they travel with the database instead of being tied to whichever
// machine the API process happens to run on.
let bucket;
function getBucket() {
  if (!bucket) {
    bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'photos' });
  }
  return bucket;
}

function uploadBuffer(buffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const uploadStream = getBucket().openUploadStream(filename, { contentType });
    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.on('error', reject);
    uploadStream.end(buffer);
  });
}

async function getFileInfo(id) {
  const _id = new mongoose.Types.ObjectId(id);
  const files = await getBucket().find({ _id }).toArray();
  return files[0] || null;
}

function openDownloadStream(id) {
  return getBucket().openDownloadStream(new mongoose.Types.ObjectId(id));
}

module.exports = { uploadBuffer, getFileInfo, openDownloadStream };
