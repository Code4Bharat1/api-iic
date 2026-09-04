const auditService = require('../services/audit.service');

async function list(req, res) {
  const logs = await auditService.listAuditLogs(req.query);
  res.json(logs);
}

module.exports = { list };
