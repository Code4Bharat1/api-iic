const ROLES = ['organiser', 'admin', 'master_admin'];

const BOOKING_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  CHANGE_REQUESTED: 'change_requested',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  EVENT_IN_PROGRESS: 'event_in_progress',
  AWAITING_CLOSURE: 'awaiting_closure',
  ISSUE_REPORTED: 'issue_reported',
  CLOSED: 'closed',
};

// statuses that hold a floor/resource reservation
const RESERVING_STATUSES = [
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.EVENT_IN_PROGRESS,
  BOOKING_STATUS.AWAITING_CLOSURE,
  BOOKING_STATUS.ISSUE_REPORTED,
];

const ISSUE_STATUS = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  CLOSED: 'closed',
};

const ISSUE_TYPES = ['missing', 'damaged', 'misplaced', 'other'];

const FLOORS = [
  { key: 'ground', name: 'Ground Floor', bookable: false, interactiveTV: false, micArrangement: false },
  { key: 'basement', name: 'Basement', bookable: true, interactiveTV: true, micArrangement: true },
  { key: 'first', name: '1st Floor', bookable: true, interactiveTV: false, micArrangement: true },
  { key: 'second', name: '2nd Floor', bookable: true, interactiveTV: true, micArrangement: true },
  { key: 'third', name: '3rd Floor', bookable: false, interactiveTV: false, micArrangement: false },
];

const CLOSURE_CHECKLIST_ITEMS = [
  { key: 'floorPhotographed', label: 'Floor photographed after event' },
  { key: 'tablesChairsReturned', label: 'Tables and chairs returned/arranged' },
  { key: 'tvPhotographed', label: 'Interactive TV photographed' },
  { key: 'micPhotographed', label: 'Microphones/equipment photographed' },
  { key: 'otherPhotographed', label: 'Other issued resources photographed' },
];

const PHOTO_CATEGORIES = [
  { key: 'overallFloor', label: 'Overall Floor' },
  { key: 'tablesChairs', label: 'Tables & Chairs' },
  { key: 'interactiveTV', label: 'Interactive TV' },
  { key: 'microphones', label: 'Microphones / Equipment' },
  { key: 'other', label: 'Other Resources' },
];

module.exports = {
  ROLES,
  BOOKING_STATUS,
  RESERVING_STATUSES,
  ISSUE_STATUS,
  ISSUE_TYPES,
  FLOORS,
  CLOSURE_CHECKLIST_ITEMS,
  PHOTO_CATEGORIES,
};
