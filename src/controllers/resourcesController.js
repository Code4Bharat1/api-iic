const resourceService = require('../services/resource.service');

async function list(req, res) {
  const resources = await resourceService.listResources(req.query);
  res.json(resources);
}

async function catalog(req, res) {
  const results = await resourceService.getCatalog(req.query);
  res.json(results);
}

async function getById(req, res) {
  const resource = await resourceService.getResourceById(req.params.id);
  res.json(resource);
}

async function create(req, res) {
  const resource = await resourceService.createResource(req.body, req.user);
  res.status(201).json(resource);
}

async function update(req, res) {
  const resource = await resourceService.updateResource(req.params.id, req.body, req.user);
  res.json(resource);
}

async function setActive(req, res) {
  const resource = await resourceService.setResourceActive(req.params.id, req.body, req.user);
  res.json(resource);
}

module.exports = { list, catalog, getById, create, update, setActive };
