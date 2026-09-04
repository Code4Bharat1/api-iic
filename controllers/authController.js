const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { logAction } = require('../utils/audit');

/**
 * POST /api/auth/login
 * Body: { identifier: string, password: string }
 * identifier may be a userId (e.g. "ORG-1001") or an email address.
 */
async function login(req, res) {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Identifier and password are required.' });
  }

  // Find by userId OR email — never reveal which one matched
  const user = await User.findOne({
    $or: [
      { userId: identifier.trim() },
      { email: identifier.trim().toLowerCase() },
    ],
  });

  // Constant-time comparison even on not-found to resist timing attacks
  const dummyHash = '$2a$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
  const hashToCompare = user?.passwordHash || dummyHash;
  const passwordMatch = await bcrypt.compare(password, hashToCompare);

  if (!user || !passwordMatch) {
    return res.status(401).json({ error: 'Invalid credentials. Please try again.' });
  }
  if (!user.active) {
    return res.status(401).json({ error: 'Your account has been deactivated. Contact an administrator.' });
  }
  if (!user.passwordHash) {
    // User exists but has no password set (e.g. seeded without one)
    return res.status(401).json({ error: 'No password set for this account. Contact an administrator.' });
  }

  const token = jwt.sign(
    { sub: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  // Audit login
  await logAction({
    user,
    action: 'Login',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.name,
  }).catch(() => {}); // non-fatal

  return res.json({
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
  });
}

/**
 * GET /api/auth/me
 * Returns the authenticated user (no passwordHash — stripped by authenticate middleware).
 */
async function me(req, res) {
  res.json(req.user);
}

module.exports = { login, me };
