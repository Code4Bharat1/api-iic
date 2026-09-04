/**
 * src/services/email.service.js
 *
 * Sends transactional booking emails to the organiser's email address
 * using Gmail SMTP via nodemailer.
 *
 * Required env vars:
 *   MAIL_USER  — Gmail address used to send mail
 *   MAIL_PASS  — Gmail App Password (not login password)
 *   MAIL_FROM  — Display name  (default: "IIC Event Management")
 *
 * If MAIL_USER / MAIL_PASS are not set the service logs a warning and
 * silently skips sending so the rest of the app continues to work.
 */

const nodemailer = require('nodemailer');

const MAIL_USER = process.env.MAIL_USER;
const MAIL_PASS = process.env.MAIL_PASS;
const MAIL_FROM = process.env.MAIL_FROM || 'IIC Event Management';

// Build transporter lazily so missing config just warns once
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  if (!MAIL_USER || !MAIL_PASS || MAIL_USER === 'your-gmail@gmail.com') {
    return null; // not configured
  }
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: MAIL_USER, pass: MAIL_PASS },
  });
  return _transporter;
}

/**
 * Core send helper. Silently skips if not configured.
 */
async function sendMail({ to, subject, html }) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[email] Not configured — skipping email to ${to}: "${subject}"`);
    return;
  }
  try {
    await transporter.sendMail({
      from: `"${MAIL_FROM}" <${MAIL_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`[email] Sent "${subject}" to ${to}`);
  } catch (err) {
    // Never crash the main flow because of a mail failure
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err.message);
  }
}

// ─── Shared layout wrapper ────────────────────────────────────────────────────
function layout(content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>IIC Event Management</title>
  <style>
    body { margin:0; padding:0; background:#f4f4f5; font-family: 'Segoe UI', Arial, sans-serif; }
    .wrap { max-width:560px; margin:32px auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 2px 16px rgba(0,0,0,0.08); }
    .header { background:#1a2e22; padding:28px 32px; }
    .header h1 { margin:0; color:#ffffff; font-size:18px; font-weight:700; letter-spacing:-0.3px; }
    .header p { margin:4px 0 0; color:#a5c4ab; font-size:13px; }
    .body { padding:28px 32px; }
    .ref { display:inline-block; background:#f0f7f1; color:#1a6b3a; font-weight:700; font-size:13px; padding:5px 12px; border-radius:20px; margin-bottom:18px; }
    h2 { margin:0 0 16px; font-size:20px; color:#111827; font-weight:700; }
    p { margin:0 0 12px; color:#374151; font-size:14px; line-height:1.6; }
    .info-box { background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px 20px; margin:20px 0; }
    .info-row { display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid #e5e7eb; font-size:13.5px; }
    .info-row:last-child { border-bottom:none; }
    .info-label { color:#6b7280; }
    .info-value { color:#111827; font-weight:600; text-align:right; }
    .status { display:inline-block; padding:4px 12px; border-radius:20px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; }
    .status-approved { background:#d1fae5; color:#065f46; }
    .status-rejected { background:#fee2e2; color:#991b1b; }
    .status-pending  { background:#fef3c7; color:#92400e; }
    .status-changes  { background:#e0e7ff; color:#3730a3; }
    .btn { display:inline-block; margin-top:8px; background:#1a2e22; color:#ffffff !important; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600; }
    .footer { background:#f9fafb; padding:16px 32px; text-align:center; font-size:12px; color:#9ca3af; border-top:1px solid #e5e7eb; }
    .note { background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:12px 16px; font-size:13px; color:#92400e; margin-top:16px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>IIC Event Management</h1>
      <p>Venue, Resource &amp; Event Operations</p>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      This is an automated message from IIC Event Management System.<br/>
      Please do not reply to this email.
    </div>
  </div>
</body>
</html>`;
}

function bookingInfoBox(booking) {
  const floorLabels = { basement: 'Basement Floor', first: '1st Floor', second: '2nd Floor' };
  return `
  <div class="info-box">
    <div class="info-row"><span class="info-label">Event</span><span class="info-value">${booking.eventName}</span></div>
    <div class="info-row"><span class="info-label">Reference</span><span class="info-value">${booking.bookingRef}</span></div>
    <div class="info-row"><span class="info-label">Floor</span><span class="info-value">${floorLabels[booking.floor] || booking.floor}</span></div>
    <div class="info-row"><span class="info-label">Date</span><span class="info-value">${booking.date}</span></div>
    <div class="info-row"><span class="info-label">Time</span><span class="info-value">${booking.startTime} – ${booking.endTime}</span></div>
  </div>`;
}

// ─── Email templates ──────────────────────────────────────────────────────────

/**
 * Sent when a new booking is successfully submitted.
 */
async function sendBookingConfirmation(booking) {
  const to = booking.organiser?.email;
  if (!to) return;
  await sendMail({
    to,
    subject: `[IIC] Booking Received — ${booking.bookingRef}`,
    html: layout(`
      <span class="ref">${booking.bookingRef}</span>
      <h2>Booking Received</h2>
      <p>Hi ${booking.organiser?.name || 'Organiser'},</p>
      <p>Your booking request has been <strong>received and is pending approval</strong> by the IIC admin team.</p>
      ${bookingInfoBox(booking)}
      <p>You will receive another email once your booking is reviewed.</p>
      <div class="note">⏳ <strong>Status:</strong> Pending Approval — no action required from your side yet.</div>
    `),
  });
}

/**
 * Sent when an admin approves the booking.
 */
async function sendBookingApproved(booking) {
  const to = booking.organiser?.email;
  if (!to) return;
  await sendMail({
    to,
    subject: `[IIC] Booking Approved ✅ — ${booking.bookingRef}`,
    html: layout(`
      <span class="ref">${booking.bookingRef}</span>
      <h2>Your Booking is Approved!</h2>
      <p>Hi ${booking.organiser?.name || 'Organiser'},</p>
      <p>Great news — your booking has been <strong>approved</strong> by the IIC admin team.</p>
      ${bookingInfoBox(booking)}
      <p>The floor and resources listed above are now reserved for your event. Please ensure all closure procedures are completed after the event.</p>
      <span class="status status-approved">Approved</span>
    `),
  });
}

/**
 * Sent when an admin rejects the booking.
 */
async function sendBookingRejected(booking, reason) {
  const to = booking.organiser?.email;
  if (!to) return;
  await sendMail({
    to,
    subject: `[IIC] Booking Rejected — ${booking.bookingRef}`,
    html: layout(`
      <span class="ref">${booking.bookingRef}</span>
      <h2>Booking Rejected</h2>
      <p>Hi ${booking.organiser?.name || 'Organiser'},</p>
      <p>Unfortunately, your booking request has been <strong>rejected</strong>.</p>
      ${bookingInfoBox(booking)}
      ${reason ? `<div class="note">❌ <strong>Reason:</strong> ${reason}</div>` : ''}
      <p style="margin-top:16px;">If you have questions, please contact the IIC admin team.</p>
      <span class="status status-rejected">Rejected</span>
    `),
  });
}

/**
 * Sent when an admin requests changes to the booking.
 */
async function sendChangesRequested(booking, comment) {
  const to = booking.organiser?.email;
  if (!to) return;
  await sendMail({
    to,
    subject: `[IIC] Changes Requested — ${booking.bookingRef}`,
    html: layout(`
      <span class="ref">${booking.bookingRef}</span>
      <h2>Changes Requested</h2>
      <p>Hi ${booking.organiser?.name || 'Organiser'},</p>
      <p>The IIC admin team has reviewed your booking and is requesting some <strong>changes</strong> before it can be approved.</p>
      ${bookingInfoBox(booking)}
      ${comment ? `<div class="note">💬 <strong>Admin comment:</strong> ${comment}</div>` : ''}
      <p style="margin-top:16px;">Please log in to the IIC portal, edit your booking accordingly, and resubmit it.</p>
      <span class="status status-changes">Changes Requested</span>
    `),
  });
}

module.exports = {
  sendBookingConfirmation,
  sendBookingApproved,
  sendBookingRejected,
  sendChangesRequested,
};
