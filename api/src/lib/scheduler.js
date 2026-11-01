const { pool } = require('../db');
const { sendOnce, layout, appUrl } = require('./mailer');
const { monthKey, isLastDayOfMonth } = require('./dates');
const { syncConnection } = require('./bank/sync');
const { buildMonthlyReport, renderMonthlyReport, shiftMonth } = require('./report');

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

// Le 1er du mois, à partir de MONTHLY_REPORT_HOUR (9 h) : bilan du mois écoulé par e-mail
async function monthlyReports(now = new Date()) {
  if (now.getDate() !== 1 || now.getHours() < (Number(process.env.MONTHLY_REPORT_HOUR) || 9)) return;
  const month = shiftMonth(monthKey(now), -1);
  const { rows } = await pool.query(
    'SELECT user_id FROM profiles WHERE onboarding_done = true AND COALESCE(monthly_report_email, true) = true'
  );
  for (const { user_id: userId } of rows) {
    await sendOnce(userId, 'monthly_report', month, async ({ firstName }) =>
      renderMonthlyReport(await buildMonthlyReport(userId, month), firstName));
  }
}

// Consentement bancaire (180 jours) : rappel 7 jours avant l'expiration, puis connexion marquée expirée
async function bankExpiryReminders(now = new Date()) {
  const { rows } = await pool.query(
    `SELECT * FROM bank_connections
     WHERE status = 'active' AND valid_until IS NOT NULL AND valid_until <= $1`,
    [new Date(now.getTime() + 7 * 86400000)]
  );
  for (const conn of rows) {
    const until = new Date(conn.valid_until);
    if (until <= now) {
      await pool.query("UPDATE bank_connections SET status = 'expired' WHERE id = $1", [conn.id]);
      continue;
    }
    const days = Math.max(1, Math.ceil((until - now) / 86400000));
    await sendOnce(conn.user_id, 'bank_expiry', `${conn.id}:${until.toISOString().slice(0, 10)}`, ({ firstName }) => ({
      subject: `🏦 Connexion ${conn.bank_name || 'bancaire'} : expire dans ${days} jour${days > 1 ? 's' : ''}`,
      html: layout(
        'Ta connexion bancaire arrive à expiration',
        `<p>${firstName ? `${firstName}, l` : 'L'}'accès à <b>${conn.bank_name || 'ta banque'}</b> expire le
         <b>${until.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</b> (consentement DSP2 de 180 jours).</p>
         <p>Après cette date, tes paiements ne seront plus récupérés automatiquement. Reconnecte-la en 1 minute :
         Banque → Connecter.</p>`,
        { href: appUrl('/?page=bank'), label: 'Reconnecter ma banque' }
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
  await monthlyReports().catch(err => console.error('[scheduler] monthly report', err.message));
  await bankExpiryReminders().catch(err => console.error('[scheduler] bank expiry', err.message));
  await bankAutoSync().catch(err => console.error('[scheduler] bank', err.message));
}

function startScheduler() {
  setTimeout(tick, 30_000);
  setInterval(tick, 15 * 60 * 1000);
}

module.exports = { startScheduler, monthEndReminders, bankExpiryReminders, monthlyReports };
