require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const Resource = require('../src/models/Resource');

async function listAll() {
  await connectDB();
  const resources = await Resource.find({}).sort({ floor: 1, name: 1 }).lean();
  console.log('TOTAL RESOURCES IN DB:', resources.length);
  for (const r of resources) {
    console.log(`${r._id} | floor: ${r.floor} | cat: ${r.category} | ${r.name} | qty: ${r.totalQuantity} | active: ${r.active}`);
  }
  await mongoose.disconnect();
}
listAll().catch(console.error);
