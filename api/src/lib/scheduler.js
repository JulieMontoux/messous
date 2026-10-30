const { pool } = require('../db');
const { sendOnce, layout, appUrl } = require('./mailer');
const { monthKey, isLastDayOfMonth } = require('./dates');
const { syncConnection } = require('./bank/sync');

const eur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// Dernier jour du mois, à partir de MONTH_END_HOUR (18h par défaut) : rappel pour enregistrer l'épargne réelle
async function monthEndReminders(now = new Date()) {
  if (!isLastDayOfMonth(now)) return;
  if (now.getHours() < (Number(process.env.MONTH_END_HOUR) || 18)) return;
  const month = monthKey(now);

  const { rows } = await pool.query(
    `SELECT p.user_id, s.total_savings, s.closed_at FROM profiles p
     LEFT JOIN savings_history s ON s.user_id = p.user_id AND s.month = $1
     WHERE p.onboarding_done = true AND COALESCE(p.month_end_email, true) = true`,
    [month]
  );
  for (const r of rows) {
    if (r.closed_at) continue;
    await sendOnce(r.user_id, 'month_end', month, ({ firstName }) => ({
      subject: `🐷 Fin ${MONTHS[now.getMonth()]} : enregistre ton épargne`,
      html: layout(
        `C'est le dernier jour de ${MONTHS[now.getMonth()]} !`,
        `<p>${firstName ? `${firstName}, p` : 'P'}rends 1 minute pour noter ce que tu as <b>réellement</b> épargné ce mois-ci et ce qu'il reste sur ton compte.</p>
         ${r.total_savings != null ? `<p>Épargne prévue : <b>${eur(Number(r.total_savings))}</b></p>` : ''}
         <p>Sans ce relevé, l'historique n'affiche que l'épargne prévue.</p>`,
        { href: appUrl(`/?page=history&close=${month}`), label: 'Enregistrer mon épargne' }
      ),
    }));
  }
}

let lastBankSync = 0;

async function bankAutoSync() {
  const hours = Number(process.env.BANK_SYNC_INTERVAL_HOURS) || 6;
  if (Date.now() - lastBankSync < hours * 3600 * 1000) return;
  lastBankSync = Date.now();
  const { rows } = await pool.query("SELECT * FROM bank_connections WHERE status = 'active'");
  for (const conn of rows) {
    await syncConnection(conn).catch(err => console.error('[bank sync]', conn.id, err.message));
  }
}

async function tick() {
  await monthEndReminders().catch(err => console.error('[scheduler] month-end', err.message));
  await bankAutoSync().catch(err => console.error('[scheduler] bank', err.message));
}

function startScheduler() {
  setTimeout(tick, 30_000);
  setInterval(tick, 15 * 60 * 1000);
}

module.exports = { startScheduler, monthEndReminders };
