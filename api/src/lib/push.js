const webpush = require('web-push');
const { pool } = require('../db');

let vapid = null;

// Clés VAPID : variables d'environnement, sinon générées une fois et conservées en base
async function getVapid() {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const { rows } = await pool.query("SELECT value FROM app_settings WHERE key = 'vapid'");
    if (rows.length) {
      vapid = JSON.parse(rows[0].value);
    } else {
      const keys = webpush.generateVAPIDKeys();
      await pool.query("INSERT INTO app_settings (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(keys)]);
      const { rows: [saved] } = await pool.query("SELECT value FROM app_settings WHERE key = 'vapid'");
      vapid = JSON.parse(saved.value);
    }
  }
  const subject = process.env.VAPID_SUBJECT || `mailto:${process.env.SMTP_FROM?.match(/[^<\s]+@[^>\s]+/)?.[0] || 'messous@localhost'}`;
  webpush.setVapidDetails(subject, vapid.publicKey, vapid.privateKey);
  return vapid;
}

// Envoie une notification à tous les appareils abonnés de l'utilisateur ; renvoie le nombre d'envois réussis
async function sendPush(userId, { title, body = '', url = '/' }) {
  const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);
  if (!rows.length) return 0;
  await getVapid();
  let sent = 0;
  for (const sub of rows) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title, body, url }),
        { TTL: 24 * 3600 }
      );
      sent++;
    } catch (err) {
      // Abonnement expiré ou révoqué côté navigateur : on le supprime
      if (err.statusCode === 404 || err.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      } else {
        console.error('[push]', err.statusCode || '', err.message);
      }
    }
  }
  return sent;
}

module.exports = { getVapid, sendPush };
