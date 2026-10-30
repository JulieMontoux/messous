const nodemailer = require('nodemailer');
const { pool } = require('../db');

let transport = null;

function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

function isMailConfigured() {
  return !!process.env.SMTP_HOST;
}

function appUrl(path = '') {
  return `${(process.env.APP_URL || '').replace(/\/$/, '')}${path}`;
}

function layout(title, body, cta) {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta.href}" style="background:#6366f1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600">${cta.label}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Inter,Arial,sans-serif;color:#1e293b">
  <div style="max-width:520px;margin:0 auto;padding:24px">
    <p style="font-weight:700;color:#6366f1;font-size:18px;margin:0 0 16px">MesSous</p>
    <div style="background:#fff;border:1px solid #f1f5f9;border-radius:16px;padding:24px">
      <h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
      ${body}
      ${button}
    </div>
    <p style="font-size:11px;color:#94a3b8;margin-top:16px">Tu reçois cet e-mail car les notifications sont activées dans ton profil MesSous.</p>
  </div></body></html>`;
}

async function recipientFor(userId) {
  const { rows } = await pool.query(
    'SELECT u.email, p.alert_email, p.first_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1',
    [userId]
  );
  if (!rows.length) return null;
  return { email: rows[0].alert_email || rows[0].email, firstName: rows[0].first_name || '' };
}

async function sendMail({ to, subject, html, text }) {
  const t = getTransport();
  if (!t) {
    console.log(`[mail] SMTP non configuré — e-mail non envoyé à ${to} : ${subject}`);
    return false;
  }
  await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, html, text });
  return true;
}

// Envoie un e-mail une seule fois par (utilisateur, type, référence)
async function sendOnce(userId, kind, ref, build) {
  const { rows } = await pool.query(
    'INSERT INTO email_log (user_id, kind, ref) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING user_id',
    [userId, kind, ref]
  );
  if (!rows.length) return false;
  try {
    const recipient = await recipientFor(userId);
    if (!recipient) return false;
    const mail = await build(recipient);
    const sent = await sendMail({ to: recipient.email, ...mail });
    if (!sent) await pool.query('DELETE FROM email_log WHERE user_id=$1 AND kind=$2 AND ref=$3', [userId, kind, ref]);
    return sent;
  } catch (err) {
    await pool.query('DELETE FROM email_log WHERE user_id=$1 AND kind=$2 AND ref=$3', [userId, kind, ref]);
    console.error('[mail]', kind, err.message);
    return false;
  }
}

module.exports = { sendMail, sendOnce, layout, appUrl, recipientFor, isMailConfigured };
