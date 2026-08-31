const User = require('../models/User');

async function demoLogin(req, res) {
  const { role } = req.body;
  const user = await User.findOne({ role, active: true }).lean();
  if (!user) return res.status(404).json({ error: `No demo user seeded for role ${role}.` });
  res.json(user);
}

async function me(req, res) {
  res.json(req.user);
}

module.exports = { demoLogin, me };
