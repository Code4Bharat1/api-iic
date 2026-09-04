const reportService = require('../services/report.service');
const { Parser } = require('json2csv'); // I might need to install this if missing. Wait, let's use a simple CSV exporter or install it later.

async function run(req, res) {
  const result = await reportService.runReport(req.params.type, req.query, req.user);
  
  // Handling export parameter
  if (req.query.export === 'csv') {
    try {
      const parser = new (require('json2csv').Parser)();
      const csv = parser.parse(result.rows);
      res.header('Content-Type', 'text/csv');
      res.attachment(`${req.params.type}-report.csv`);
      return res.send(csv);
    } catch (err) {
      // If json2csv is not installed or fails, fallback to simple implementation or error
      console.error(err);
      return res.status(500).json({ error: 'Export failed. Ensure json2csv is installed.' });
    }
  }

  res.json(result);
}

module.exports = { run };
