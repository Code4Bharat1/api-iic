// "HH:mm" -> minutes since midnight
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// true if [aStart,aEnd) overlaps [bStart,bEnd)
function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd);
}

module.exports = { toMinutes, rangesOverlap };
