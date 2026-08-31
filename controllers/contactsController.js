const Contact = require('../models/Contact');
const { logAction } = require('../utils/audit');

async function list(req, res) {
  const { search, status } = req.query;
  const query = {};
  if (status === 'active') query.active = true;
  if (status === 'inactive') query.active = false;
  if (search) query.name = new RegExp(search, 'i');
  res.json(await Contact.find(query).sort({ name: 1 }).lean());
}

async function create(req, res) {
  const { name, role, phone, email } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  const contact = await Contact.create({ name, role, phone, email });
  await logAction({ user: req.user, action: 'Created Contact', entity: 'Contact', entityId: contact._id, entityLabel: contact.name });
  res.status(201).json(contact);
}

async function update(req, res) {
  const contact = await Contact.findById(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });
  ['name', 'role', 'phone', 'email', 'active'].forEach((f) => {
    if (req.body[f] !== undefined) contact[f] = req.body[f];
  });
  await contact.save();
  await logAction({ user: req.user, action: 'Updated Contact', entity: 'Contact', entityId: contact._id, entityLabel: contact.name });
  res.json(contact);
}

module.exports = { list, create, update };
