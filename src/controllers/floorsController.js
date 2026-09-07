const Floor = require('../models/Floor');
const Resource = require('../models/Resource');
const { logAction } = require('../services/audit.service');

// Floor settings checkboxes map to an auto-managed, floor-scoped toggle Resource
// so that enabling one actually makes it bookable via the resource catalog.
const SPECIAL_RESOURCES = {
  interactiveTV: { name: 'Interactive TV', category: 'Electronics' },
  micArrangement: { name: 'Mic Arrangement', category: 'Audio' },
};

async function syncSpecialResource(floor, flagKey, enabled, user) {
  const spec = SPECIAL_RESOURCES[flagKey];
  // Exact single-floor scope only — never touch a resource an admin has
  // manually pooled across multiple floors under the same name.
  const existing = await Resource.findOne({
    name: new RegExp(`^${spec.name}$`, 'i'),
    inventoryScope: 'floor',
    floors: [floor.key],
  });

  if (existing) {
    if (existing.active !== enabled) {
      existing.active = enabled;
      existing.history.push({
        action: enabled ? 'Enabled' : 'Disabled',
        changedBy: user.name,
        reason: `Floor setting: ${spec.name} ${enabled ? 'enabled' : 'disabled'} for ${floor.name}`,
      });
      await existing.save();
    }
    return;
  }

  if (enabled) {
    await Resource.create({
      name: spec.name,
      category: spec.category,
      inventoryScope: 'floor',
      floors: [floor.key],
      unitType: 'toggle',
      totalQuantity: 1,
      active: true,
      history: [{ action: 'Created', newQuantity: 1, changedBy: user.name, reason: `Auto-created from floor setting for ${floor.name}` }],
    });
  }
}

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

  if (interactiveTV !== undefined) await syncSpecialResource(floor, 'interactiveTV', interactiveTV, req.user);
  if (micArrangement !== undefined) await syncSpecialResource(floor, 'micArrangement', micArrangement, req.user);

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

  if (floor.interactiveTV) await syncSpecialResource(floor, 'interactiveTV', true, req.user);
  if (floor.micArrangement) await syncSpecialResource(floor, 'micArrangement', true, req.user);

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
