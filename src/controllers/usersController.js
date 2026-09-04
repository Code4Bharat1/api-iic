const userService = require('../services/user.service');

async function list(req, res) {
  const users = await userService.listUsers(req.query);
  res.json(users);
}

async function create(req, res) {
  const user = await userService.createUser(req.body, req.user);
  res.status(201).json(user);
}

async function update(req, res) {
  const user = await userService.updateUser(req.params.id, req.body, req.user);
  res.json(user);
}

async function setStatus(req, res) {
  const result = await userService.setStatus(req.params.id, req.body.active, req.user);
  res.json(result);
}

async function setRole(req, res) {
  const result = await userService.setRole(req.params.id, req.body.role, req.user);
  res.json(result);
}

module.exports = { list, create, update, setStatus, setRole };
