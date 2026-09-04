const issueService = require('../services/issue.service');

async function list(req, res) {
  const issues = await issueService.listIssues(req.query);
  res.json(issues);
}

async function getById(req, res) {
  const issue = await issueService.getIssueById(req.params.id);
  res.json(issue);
}

async function uploadPhoto(req, res) {
  const result = await issueService.uploadIssuePhoto(req.file);
  res.status(201).json(result);
}

async function create(req, res) {
  const issue = await issueService.createIssue(req.body, req.user);
  res.status(201).json(issue);
}

async function resolve(req, res) {
  const issue = await issueService.resolveIssue(req.params.id, req.body, req.user);
  res.json(issue);
}

module.exports = { list, getById, create, resolve, uploadPhoto };
