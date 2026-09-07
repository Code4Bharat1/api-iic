const express = require('express');
const cors = require('cors');
const path = require('path');
require('express-async-errors');
const routes = require('./routes');
const { getFileInfo, openDownloadStream } = require('./utils/gridfs');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Closure photos stored in GridFS — streamed straight from Mongo, same
// unauthenticated root-relative access pattern as /uploads above (plain
// <img> tags can't attach an Authorization header).
app.get('/photos/:id', async (req, res) => {
  const info = await getFileInfo(req.params.id).catch(() => null);
  if (!info) return res.status(404).json({ error: 'Photo not found' });
  res.set('Content-Type', info.contentType || 'application/octet-stream');
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  openDownloadStream(req.params.id)
    .on('error', () => res.status(404).end())
    .pipe(res);
});

app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({ 
    error: err.message || 'Internal server error',
    ...(err.errors && { errors: err.errors }),
    ...(err.conflict && { conflict: err.conflict, conflicts: err.conflicts, canOverride: err.canOverride }),
    ...(err.resourceConflict && { resourceConflict: err.resourceConflict })
  });
});

module.exports = app;
