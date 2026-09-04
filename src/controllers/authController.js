const authService = require('../services/auth.service');

async function login(req, res) {
  const result = await authService.loginUser(req.body.identifier, req.body.password);
  res.json(result);
}

async function me(req, res) {
  res.json(req.user);
}

module.exports = { login, me };
