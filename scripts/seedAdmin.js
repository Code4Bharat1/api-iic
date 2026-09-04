/**
 * scripts/seedAdmin.js
 *
 * Creates or updates the initial Master Admin user.
 * Does NOT wipe existing data — safe to run on a live database.
 *
 * Required env vars (in api-iic/.env):
 *   MASTER_ADMIN_USER_ID   e.g. MST-0001
 *   MASTER_ADMIN_NAME      e.g. System Administrator
 *   MASTER_ADMIN_EMAIL     e.g. admin@yourdomain.com
 *   MASTER_ADMIN_PASSWORD  (never commit this)
 *
 * Usage:  npm run seed:admin
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

async function seedAdmin() {
  const { MASTER_ADMIN_USER_ID, MASTER_ADMIN_NAME, MASTER_ADMIN_EMAIL, MASTER_ADMIN_PASSWORD } = process.env;

  if (!MASTER_ADMIN_USER_ID || !MASTER_ADMIN_NAME || !MASTER_ADMIN_EMAIL || !MASTER_ADMIN_PASSWORD) {
    console.error('ERROR: MASTER_ADMIN_USER_ID, MASTER_ADMIN_NAME, MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD must be set in .env');
    process.exit(1);
  }

  await connectDB();

  const passwordHash = await bcrypt.hash(MASTER_ADMIN_PASSWORD, 10);

  const existing = await User.findOne({ $or: [{ userId: MASTER_ADMIN_USER_ID }, { email: MASTER_ADMIN_EMAIL.toLowerCase() }] });

  if (existing) {
    existing.name = MASTER_ADMIN_NAME;
    existing.email = MASTER_ADMIN_EMAIL.toLowerCase();
    existing.passwordHash = passwordHash;
    existing.role = 'master_admin';
    existing.active = true;
    await existing.save();
    console.log(`[seed:admin] Updated existing master admin: ${existing.userId} / ${existing.email}`);
  } else {
    await User.create({
      userId: MASTER_ADMIN_USER_ID,
      name: MASTER_ADMIN_NAME,
      email: MASTER_ADMIN_EMAIL.toLowerCase(),
      passwordHash,
      role: 'master_admin',
      active: true,
      department: 'IIC Administration',
    });
    console.log(`[seed:admin] Created master admin: ${MASTER_ADMIN_USER_ID} / ${MASTER_ADMIN_EMAIL}`);
  }

  console.log('[seed:admin] Done. Login with the configured MASTER_ADMIN_EMAIL and MASTER_ADMIN_PASSWORD.');
  await mongoose.disconnect();
}

seedAdmin().catch((err) => {
  console.error('[seed:admin] Error:', err.message);
  process.exit(1);
});
