const User = require('../models/User');
const { logAction } = require('../utils/audit');

async function list(req, res) {
  const { search, role, status } = req.query;
  const query = {};
  if (role) query.role = role;
  if (status === 'active') query.active = true;
  if (status === 'inactive') query.active = false;
  if (search) query.$or = [{ name: new RegExp(search, 'i') }, { userId: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  res.json(await User.find(query).sort({ name: 1 }).lean());
}

async function create(req, res) {
  const { userId, name, email, mobile, role, department } = req.body;
  if (!userId || !name || !email || !role) return res.status(400).json({ error: 'userId, name, email and role are required.' });
  const user = await User.create({ userId, name, email, mobile, role, department });
  await logAction({ user: req.user, action: 'Created User', entity: 'User', entityId: user._id, entityLabel: user.name });
  res.status(201).json(user);
}

async function update(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  ['name', 'email', 'mobile', 'role', 'department', 'active'].forEach((f) => {
    if (req.body[f] !== undefined) user[f] = req.body[f];
  });
  await user.save();
  await logAction({ user: req.user, action: 'Updated User', entity: 'User', entityId: user._id, entityLabel: user.name });
  res.json(user);
}

module.exports = { list, create, update };
