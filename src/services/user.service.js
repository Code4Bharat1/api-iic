const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ROLES } = require('../utils/constants');
const { logAction } = require('../services/audit.service');

async function listUsers(queryOptions) {
  const { search, role, status } = queryOptions;
  const query = {};
  if (role) query.role = role;
  if (status === 'active') query.active = true;
  if (status === 'inactive') query.active = false;
  if (search) query.$or = [{ name: new RegExp(search, 'i') }, { userId: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  const users = await User.find(query).select('-passwordHash').sort({ name: 1 }).lean();
  return users;
}

async function createUser(body, requestUser) {
  const { userId, name, email, mobile, role, department, password } = body;
  if (!userId || !name || !email || !role) throw Object.assign(new Error('userId, name, email and role are required.'), { status: 400 });
  if (!ROLES.includes(role)) throw Object.assign(new Error(`Invalid role. Must be one of: ${ROLES.join(', ')}.`), { status: 400 });
  if (!password) throw Object.assign(new Error('password is required when creating a user.'), { status: 400 });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ userId, name, email, mobile, role, department, passwordHash });
  await logAction({ user: requestUser, action: 'Created User', entity: 'User', entityId: user._id, entityLabel: user.name });
  
  const obj = user.toObject();
  delete obj.passwordHash;
  return obj;
}

async function updateUser(id, body, requestUser) {
  const user = await User.findById(id);
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 });

  if (body.role && !ROLES.includes(body.role)) {
    throw Object.assign(new Error(`Invalid role. Must be one of: ${ROLES.join(', ')}.`), { status: 400 });
  }

  ['name', 'email', 'mobile', 'role', 'department', 'active'].forEach((f) => {
    if (body[f] !== undefined) user[f] = body[f];
  });

  if (body.password) {
    user.passwordHash = await bcrypt.hash(body.password, 10);
  }

  await user.save();
  await logAction({ user: requestUser, action: 'Updated User', entity: 'User', entityId: user._id, entityLabel: user.name });
  const obj = user.toObject();
  delete obj.passwordHash;
  return obj;
}

async function setStatus(id, active, requestUser) {
  const user = await User.findById(id);
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 });
  if (typeof active !== 'boolean') throw Object.assign(new Error('active (boolean) is required.'), { status: 400 });
  user.active = active;
  await user.save();
  await logAction({ user: requestUser, action: user.active ? 'Activated User' : 'Deactivated User', entity: 'User', entityId: user._id, entityLabel: user.name });
  return { active: user.active };
}

async function setRole(id, role, requestUser) {
  const user = await User.findById(id);
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 });
  if (!role || !ROLES.includes(role)) throw Object.assign(new Error(`Invalid role. Must be one of: ${ROLES.join(', ')}.`), { status: 400 });
  const oldRole = user.role;
  user.role = role;
  await user.save();
  await logAction({ user: requestUser, action: 'Changed User Role', entity: 'User', entityId: user._id, entityLabel: user.name, oldValue: oldRole, newValue: role });
  return { role: user.role };
}

module.exports = { listUsers, createUser, updateUser, setStatus, setRole };
