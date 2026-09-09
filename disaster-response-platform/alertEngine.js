/**
 * alertEngine.js
 * --------------
 * Sends a real email notification to a configured inbox whenever a new
 * report meets the severity threshold. This is the "actually reaches a real
 * person" piece of the platform - the recipient could be a local disaster
 * management office, an NGO, a volunteer group, or your own family/contacts.
 *
 * IMPORTANT: This does NOT connect to any government police/fire/ambulance
 * dispatch system - no such public API exists. It only emails whatever
 * address you configure in .env. A real human still has to read the email
 * and act on it; nothing here automatically summons help.
 *
 * Disabled by default. To enable:
 *   1. Copy .env.example to .env
 *   2. Set EMAIL_ALERTS_ENABLED=true
 *   3. Fill in SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ALERT_FROM_EMAIL,
 *      ALERT_TO_EMAIL (see .env.example for a Gmail walkthrough)
 */

let nodemailer;
try {
  nodemailer = require("nodemailer");
} catch (e) {
  nodemailer = null; // package not installed - alerts silently stay disabled
}

const SEVERITY_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };

function isEnabled() {
  return process.env.EMAIL_ALERTS_ENABLED === "true" && !!nodemailer;
}

function meetsThreshold(level) {
  const minLevel = process.env.ALERT_MIN_SEVERITY || "High";
  return (SEVERITY_RANK[level] || 0) >= (SEVERITY_RANK[minLevel] || 3);
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function buildEmailBody(report, nearest) {
  const mapsLink =
    report.lat != null && report.lng != null
      ? `https://www.google.com/maps?q=${report.lat},${report.lng}`
      : "No location provided";

  const nearestHospital = nearest?.hospitals?.[0];
  const etaLine = nearestHospital
    ? `Estimated responder travel time: ~${nearestHospital.etaMinutes} min (based on distance to ${nearestHospital.name})`
    : "Estimated travel time: not available (no location)";

  return `🚨 NEW ${report.severity.level.toUpperCase()} EMERGENCY REPORT (score ${report.severity.score}/10)

Request ID: ${report.id}
Type: ${report.emergencyType || report.severity.disasterType || "Unspecified"}
Reported by: ${report.name}${report.phone ? " · " + report.phone : ""}
People affected: ${report.peopleCount || "Not specified"}
Time: ${new Date(report.createdAt).toLocaleString()}

Description:
${report.text}

Location: ${mapsLink}
${etaLine}

${report.audioUrl ? "A voice recording was also attached to this report." : ""}

— Sent automatically by RescueLink. Reply/act on this only if you are the
   designated responder for this alert address.`;
}

/**
 * Fire-and-forget: never throws, never blocks report submission. Any SMTP
 * failure (bad credentials, offline, etc.) is logged and swallowed.
 */
async function sendEmailAlert(report, nearest) {
  if (!isEnabled()) return { sent: false, reason: "disabled" };
  if (!meetsThreshold(report.severity.level)) return { sent: false, reason: "below_threshold" };
  if (!process.env.ALERT_TO_EMAIL) return { sent: false, reason: "no_recipient_configured" };

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.ALERT_FROM_EMAIL || process.env.SMTP_USER,
      to: process.env.ALERT_TO_EMAIL,
      subject: `🚨 ${report.severity.level} emergency — ${report.emergencyType || report.severity.disasterType || "report"} — ${report.id}`,
      text: buildEmailBody(report, nearest),
    });
    return { sent: true };
  } catch (err) {
    console.error("Email alert failed to send:", err.message);
    return { sent: false, reason: "send_failed", error: err.message };
  }
}

module.exports = { sendEmailAlert, isEnabled };
