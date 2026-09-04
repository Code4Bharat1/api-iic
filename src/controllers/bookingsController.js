const bookingService = require('../services/booking.service');

async function list(req, res) {
  const bookings = await bookingService.listBookings(req.query, req.user);
  res.json(bookings);
}

async function getById(req, res) {
  const booking = await bookingService.getBookingById(req.params.id, req.user);
  res.json(booking);
}

async function competing(req, res) {
  const bookings = await bookingService.getCompetingBookings(req.params.id);
  res.json(bookings);
}

async function create(req, res) {
  const booking = await bookingService.createBooking(req.body, req.user);
  res.status(201).json(booking);
}

async function update(req, res) {
  const booking = await bookingService.updateBooking(req.params.id, req.body, req.user);
  res.json(booking);
}

async function approve(req, res) {
  const booking = await bookingService.approveBooking(req.params.id, req.body, req.user);
  res.json(booking);
}

async function reject(req, res) {
  const booking = await bookingService.rejectBooking(req.params.id, req.body, req.user);
  res.json(booking);
}

async function requestChanges(req, res) {
  const booking = await bookingService.requestChangesBooking(req.params.id, req.body, req.user);
  res.json(booking);
}

async function submitClosurePhoto(req, res) {
  const result = await bookingService.submitClosurePhoto(req.params.id, req.file, req.body.category, req.user);
  res.status(201).json(result);
}

async function submitClosure(req, res) {
  const booking = await bookingService.submitClosure(req.params.id, req.body, req.user);
  res.json(booking);
}

async function verifyClosure(req, res) {
  const booking = await bookingService.verifyClosure(req.params.id, req.user);
  res.json(booking);
}

module.exports = {
  list,
  getById,
  competing,
  create,
  update,
  approve,
  reject,
  requestChanges,
  submitClosurePhoto,
  submitClosure,
  verifyClosure,
};
