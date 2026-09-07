const authService = require('../services/auth.service');

async function login(req, res) {
  const result = await authService.loginUser(req.body.identifier, req.body.password);
  res.json(result);
}

async function me(req, res) {
  res.json(req.user);
}

async function changePassword(req, res) {
  const result = await authService.changePassword(req.user._id, req.body.currentPassword, req.body.newPassword);
  res.json(result);
}

module.exports = { login, me, changePassword };
