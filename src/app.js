const express = require('express');
const cors = require('cors');
const path = require('path');
require('express-async-errors');
const routes = require('./routes');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    ...(err.errors && { errors: err.errors }),
    ...(err.conflict && { conflict: err.conflict, conflicts: err.conflicts, canOverride: err.canOverride }),
    ...(err.resourceConflict && { resourceConflict: err.resourceConflict })
  });
});

module.exports = app;
