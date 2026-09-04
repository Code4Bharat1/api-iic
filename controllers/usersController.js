const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ROLES } = require('../utils/constants');
const { logAction } = require('../utils/audit');

async function list(req, res) {
  const { search, role, status } = req.query;
  const query = {};
  if (role) query.role = role;
  if (status === 'active') query.active = true;
  if (status === 'inactive') query.active = false;
  if (search) query.$or = [{ name: new RegExp(search, 'i') }, { userId: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  const users = await User.find(query).select('-passwordHash').sort({ name: 1 }).lean();
  res.json(users);
}

async function create(req, res) {
  const { userId, name, email, mobile, role, department, password } = req.body;
  if (!userId || !name || !email || !role) return res.status(400).json({ error: 'userId, name, email and role are required.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}.` });
  if (!password) return res.status(400).json({ error: 'password is required when creating a user.' });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ userId, name, email, mobile, role, department, passwordHash });
  await logAction({ user: req.user, action: 'Created User', entity: 'User', entityId: user._id, entityLabel: user.name });
  res.status(201).json({ ...user.toObject(), passwordHash: undefined });
}

async function update(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  // Prevent privilege escalation: only master_admin can promote to master_admin
  if (req.body.role && !ROLES.includes(req.body.role)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}.` });
  }

  ['name', 'email', 'mobile', 'role', 'department', 'active'].forEach((f) => {
    if (req.body[f] !== undefined) user[f] = req.body[f];
  });

  // Allow password reset via PUT
  if (req.body.password) {
    user.passwordHash = await bcrypt.hash(req.body.password, 10);
  }

  await user.save();
  await logAction({ user: req.user, action: 'Updated User', entity: 'User', entityId: user._id, entityLabel: user.name });
  const obj = user.toObject();
  delete obj.passwordHash;
  res.json(obj);
}

async function setStatus(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'active (boolean) is required.' });
  user.active = req.body.active;
  await user.save();
  await logAction({ user: req.user, action: user.active ? 'Activated User' : 'Deactivated User', entity: 'User', entityId: user._id, entityLabel: user.name });
  res.json({ active: user.active });
}

async function setRole(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const { role } = req.body;
  if (!role || !ROLES.includes(role)) return res.status(400).json({ error: `Invalid role. Must be one of: ${ROLES.join(', ')}.` });
  const oldRole = user.role;
  user.role = role;
  await user.save();
  await logAction({ user: req.user, action: 'Changed User Role', entity: 'User', entityId: user._id, entityLabel: user.name, oldValue: oldRole, newValue: role });
  res.json({ role: user.role });
}

module.exports = { list, create, update, setStatus, setRole };
