const express = require('express');
const multer = require('multer');
const path = require('path');
const { currentUser, requireRole } = require('../middleware/currentUser');

const auth = require('../controllers/authController');
const floors = require('../controllers/floorsController');
const resources = require('../controllers/resourcesController');
const bookings = require('../controllers/bookingsController');
const availability = require('../controllers/availabilityController');
const issues = require('../controllers/issuesController');
const contacts = require('../controllers/contactsController');
const users = require('../controllers/usersController');
const auditLog = require('../controllers/auditLogController');
const notifications = require('../controllers/notificationsController');
const settings = require('../controllers/settingsController');
const reports = require('../controllers/reportsController');
const dashboard = require('../controllers/dashboardController');

const router = express.Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '..', 'uploads'),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

// --- auth (no currentUser required) ---
router.post('/auth/demo-login', auth.demoLogin);

// everything below requires a demo-authenticated user
router.use(currentUser);

router.get('/auth/me', auth.me);

router.get('/floors', floors.list);
router.put('/floors/:id', requireRole('master_admin'), floors.update);

router.get('/resources', resources.list);
router.get('/resources/catalog', resources.catalog);
router.get('/resources/:id', resources.getById);
router.post('/resources', requireRole('admin', 'master_admin'), resources.create);
router.put('/resources/:id', requireRole('admin', 'master_admin'), resources.update);
router.post('/resources/:id/status', requireRole('admin', 'master_admin'), resources.setActive);

router.get('/availability/check', availability.check);
router.get('/availability/timeline', availability.timeline);

router.get('/bookings', bookings.list);
router.get('/bookings/:id', bookings.getById);
router.post('/bookings', bookings.create);
router.put('/bookings/:id', bookings.update);
router.post('/bookings/:id/approve', requireRole('admin', 'master_admin'), bookings.approve);
router.post('/bookings/:id/reject', requireRole('admin', 'master_admin'), bookings.reject);
router.post('/bookings/:id/request-changes', requireRole('admin', 'master_admin'), bookings.requestChanges);
router.post('/bookings/:id/closure/photo', upload.single('photo'), bookings.submitClosurePhoto);
router.post('/bookings/:id/closure/submit', bookings.submitClosure);
router.post('/bookings/:id/closure/verify', requireRole('admin', 'master_admin'), bookings.verifyClosure);
router.get('/bookings/:id/competing', requireRole('admin', 'master_admin'), bookings.competing);

router.get('/issues', issues.list);
router.get('/issues/:id', issues.getById);
router.post('/issues/photo', requireRole('admin', 'master_admin'), upload.single('photo'), issues.uploadPhoto);
router.post('/issues', requireRole('admin', 'master_admin'), issues.create);
router.post('/issues/:id/resolve', requireRole('admin', 'master_admin'), issues.resolve);

router.get('/contacts', contacts.list);
router.post('/contacts', requireRole('admin', 'master_admin'), contacts.create);
router.put('/contacts/:id', requireRole('admin', 'master_admin'), contacts.update);

router.get('/users', requireRole('master_admin'), users.list);
router.post('/users', requireRole('master_admin'), users.create);
router.put('/users/:id', requireRole('master_admin'), users.update);

router.get('/audit-log', auditLog.list);

router.get('/notifications', notifications.list);
router.post('/notifications/:id/read', notifications.markRead);
router.post('/notifications/read-all', notifications.markAllRead);

router.get('/settings', settings.get);
router.put('/settings', requireRole('master_admin'), settings.update);

router.get('/reports/:type', reports.run);

router.get('/dashboard', dashboard.get);

module.exports = router;
