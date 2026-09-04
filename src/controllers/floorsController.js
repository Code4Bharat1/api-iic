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

module.exports = { list, update };
