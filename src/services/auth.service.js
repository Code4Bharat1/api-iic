const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAction } = require('../services/audit.service');

async function loginUser(identifier, password) {
  if (!identifier || !password) {
    throw Object.assign(new Error('Identifier and password are required.'), { status: 400 });
  }

  const user = await User.findOne({
    $or: [
      { userId: identifier.trim() },
      { email: identifier.trim().toLowerCase() },
    ],
  });

  const dummyHash = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  const hashToCompare = user?.passwordHash || dummyHash;
  const passwordMatch = await bcrypt.compare(password, hashToCompare);

  if (!user || !passwordMatch) {
    throw Object.assign(new Error('Invalid credentials. Please try again.'), { status: 401 });
  }
  if (!user.active) {
    throw Object.assign(new Error('Your account has been deactivated. Contact an administrator.'), { status: 401 });
  }
  if (!user.passwordHash) {
    throw Object.assign(new Error('No password set for this account. Contact an administrator.'), { status: 401 });
  }

  const token = jwt.sign(
    { sub: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  await logAction({
    user,
    action: 'Login',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.name,
  }).catch(() => {});

  return {
    success: true,
    token,
    user: {
      id: user._id,
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      mobile: user.mobile,
    },
  };
}

module.exports = { loginUser };
