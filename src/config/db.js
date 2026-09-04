const dns = require('dns');
const mongoose = require('mongoose');

// Override system DNS to use public resolvers — required in some environments
// where the system DNS cannot resolve MongoDB Atlas SRV records.
dns.setServers(['8.8.8.8', '1.1.1.1']);

async function connectDB() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set in the environment (.env)');
  }
  await mongoose.connect(uri);
  console.log('[db] connected');
}

module.exports = connectDB;
