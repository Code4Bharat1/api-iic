const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ROLES } = require('../utils/constants');
const { logAction } = require('../services/audit.service');
const { sendUserCredentials } = require('../services/email.service');

/**
 * Generates a readable temporary password:
 *   e.g.  Iic@xK9m2pLq
 * 12 chars: prefix "Iic@" + 8 random alphanumeric chars
 */
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const random = Array.from(crypto.randomBytes(8))
    .map((b) => chars[b % chars.length])
    .join('');
  return `Iic@${random}`;
}

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
  const { userId, name, email, mobile, role, department } = body;
  if (!userId || !name || !email || !role) {
    throw Object.assign(new Error('userId, name, email and role are required.'), { status: 400 });
  }
  if (!ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role. Must be one of: ${ROLES.join(', ')}.`), { status: 400 });
  }

  // Auto-generate a secure temporary password
  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  const user = await User.create({
    userId,
    name,
    email,
    mobile,
    role,
    department,
    passwordHash,
    mustChangePassword: true,
  });

  await logAction({
    user: requestUser,
    action: 'Created User',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.name,
  });

  // Fire credentials email (non-blocking — never crashes the request)
  sendUserCredentials(user, tempPassword).catch((err) =>
    console.error('[user.service] Failed to send credentials email:', err.message)
  );

  const obj = user.toObject();
  delete obj.passwordHash;
  return obj;
}

async function resendCredentials(id, requestUser) {
  const user = await User.findById(id);
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 });

  // Generate a fresh temporary password and update the user
  const tempPassword = generateTempPassword();
  user.passwordHash = await bcrypt.hash(tempPassword, 10);
  user.mustChangePassword = true;
  await user.save();

  await logAction({
    user: requestUser,
    action: 'Resent Credentials',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.name,
  });

  // Send email (non-blocking)
  sendUserCredentials(user, tempPassword).catch((err) =>
    console.error('[user.service] Failed to resend credentials email:', err.message)
  );

  return { success: true, message: `Credentials sent to ${user.email}` };
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
    user.mustChangePassword = false; // admin explicitly set a password
  }

  await user.save();
  await logAction({
    user: requestUser,
    action: 'Updated User',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.name,
  });
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
  await logAction({
    user: requestUser,
    action: user.active ? 'Activated User' : 'Deactivated User',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.name,
  });
  return { active: user.active };
}

async function setRole(id, role, requestUser) {
  const user = await User.findById(id);
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 });
  if (!role || !ROLES.includes(role)) {
    throw Object.assign(new Error(`Invalid role. Must be one of: ${ROLES.join(', ')}.`), { status: 400 });
  }
  const oldRole = user.role;
  user.role = role;
  await user.save();
  await logAction({
    user: requestUser,
    action: 'Changed User Role',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.name,
    oldValue: oldRole,
    newValue: role,
  });
  return { role: user.role };
}

async function deleteUser(id, requestUser) {
  const user = await User.findById(id);
  if (!user) throw Object.assign(new Error('User not found.'), { status: 404 });
  // Prevent deleting yourself
  if (String(user._id) === String(requestUser._id)) {
    throw Object.assign(new Error('You cannot delete your own account.'), { status: 400 });
  }
  await User.findByIdAndDelete(id);
  await logAction({
    user: requestUser,
    action: 'Deleted User',
    entity: 'User',
    entityId: user._id,
    entityLabel: user.name,
  });
  return { success: true };
}

module.exports = { listUsers, createUser, resendCredentials, deleteUser, updateUser, setStatus, setRole };
