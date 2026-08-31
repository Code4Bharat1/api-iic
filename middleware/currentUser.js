const User = require('../models/User');

// Demo auth: frontend sends the seeded user's Mongo _id as x-user-id after "login".
async function currentUser(req, res, next) {
  const userId = req.header('x-user-id');
  if (!userId) return res.status(401).json({ error: 'Missing x-user-id header (not signed in).' });
  const user = await User.findById(userId).lean();
  if (!user || !user.active) return res.status(401).json({ error: 'Invalid or inactive user.' });
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

module.exports = { currentUser, requireRole };
