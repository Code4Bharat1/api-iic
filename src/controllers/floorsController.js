const Floor = require('../models/Floor');
const { logAction } = require('../services/audit.service');

async function list(req, res) {
  const floors = await Floor.find().sort({ createdAt: 1 }).lean();
  res.json(floors);
}

async function update(req, res) {
  const floor = await Floor.findById(req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });
  const before = floor.toObject();
  const { bookable, interactiveTV, micArrangement } = req.body;
  if (bookable !== undefined) floor.bookable = bookable;
  if (interactiveTV !== undefined) floor.interactiveTV = interactiveTV;
  if (micArrangement !== undefined) floor.micArrangement = micArrangement;
  await floor.save();

  await logAction({
    user: req.user,
    action: 'Updated Floor Configuration',
    entity: 'Floor',
    entityId: floor._id,
    entityLabel: floor.name,
    oldValue: before,
    newValue: floor.toObject(),
  });

  res.json(floor);
}

async function create(req, res) {
  const { name, key, bookable, interactiveTV, micArrangement } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Floor name is required.' });
  }

  const generatedKey = (key || name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (!generatedKey) {
    return res.status(400).json({ error: 'Invalid floor key or name.' });
  }

  const existing = await Floor.findOne({ $or: [{ key: generatedKey }, { name: name.trim() }] });
  if (existing) {
    return res.status(409).json({ error: 'A floor with this name or key already exists.' });
  }

  const floor = await Floor.create({
    key: generatedKey,
    name: name.trim(),
    bookable: bookable !== undefined ? !!bookable : true,
    interactiveTV: !!interactiveTV,
    micArrangement: !!micArrangement,
  });

  await logAction({
    user: req.user,
    action: 'Created Floor',
    entity: 'Floor',
    entityId: floor._id,
    entityLabel: floor.name,
    newValue: floor.toObject(),
  });

  res.status(201).json(floor);
}

async function remove(req, res) {
  const floor = await Floor.findById(req.params.id);
  if (!floor) return res.status(404).json({ error: 'Floor not found.' });

  await Floor.findByIdAndDelete(req.params.id);

  await logAction({
    user: req.user,
    action: 'Deleted Floor',
    entity: 'Floor',
    entityId: floor._id,
    entityLabel: floor.name,
    oldValue: floor.toObject(),
  });

  res.json({ success: true, message: 'Floor deleted successfully.' });
}

module.exports = { list, create, update, remove };
