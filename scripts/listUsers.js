require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function listUsers() {
  await connectDB();
  const users = await User.find(
    { role: { $in: ['master_admin', 'admin', 'organiser'] } },
    'userId name email role active'
  ).lean();
  console.log(JSON.stringify(users, null, 2));
  await mongoose.disconnect();
}

listUsers().catch(e => { console.error(e.message); process.exit(1); });
