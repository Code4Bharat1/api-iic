const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * authenticate — reads Authorization: Bearer <token>, verifies JWT,
 * loads the user from MongoDB, checks active status, attaches to req.user.
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }

  const user = await User.findById(payload.sub).lean();
  if (!user) {
    return res.status(401).json({ error: 'User not found. Please sign in again.' });
  }
  if (!user.active) {
    return res.status(401).json({ error: 'Your account has been deactivated. Contact an administrator.' });
  }

  // Never expose passwordHash downstream
  delete user.passwordHash;
  req.user = user;
  next();
}

/**
 * requireRole(...roles) — authorization middleware.
 * Must be used AFTER authenticate.
 * Usage: requireRole('admin', 'master_admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
