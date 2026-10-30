const { pool } = require('../db');
const { sendOnce, layout, appUrl } = require('./mailer');
const { monthKey, localDate, daysInMonth } = require('./dates');

const eur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

// Vérifie le seuil d'alerte d'une enveloppe sur le mois en cours et envoie un e-mail si franchi.
// expenseDate : date de la dépense qui déclenche la vérification — une dépense d'un autre mois
// (ex. classement des opérations du mois précédent) ne déclenche jamais d'e-mail.
async function checkEnvelopeAlert(userId, envelopeId, expenseDate) {
  if (!envelopeId) return;
  if (!isInCurrentMonth(expenseDate)) return;
  const { rows: [profile] } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [userId]);
  if (!profile || profile.alerts_enabled === false) return;

  const { rows: [env] } = await pool.query('SELECT * FROM envelopes WHERE id = $1 AND user_id = $2', [envelopeId, userId]);
  if (!env || env.type === 'saving') return;
  const budget = Number(env.budget_monthly) || 0;
  if (budget <= 0) return;

  const now = new Date();
  const month = monthKey(now);
  const { rows: [{ spent }] } = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS spent FROM transactions
     WHERE user_id = $1 AND envelope_id = $2 AND date >= $3 AND date <= $4`,
    [userId, envelopeId, `${month}-01`, localDate(now)]
  );
  const spentNum = Number(spent);
  const remaining = budget - spentNum;
  const pct = Math.round((spentNum / budget) * 100);
  const threshold = Number(profile.alert_threshold) || 80;
  const daysLeft = daysInMonth(now) - now.getDate();

  // Tabac : alerte dédiée quand le budget restant ne permet plus d'acheter un paquet
  if (env.category_id === 'tobacco') {
    const packPrice = Number(profile.tobacco_pack_price) || 0;
    if (packPrice > 0 && remaining < packPrice) {
      await sendOnce(userId, 'tobacco_alert', month, ({ firstName }) => ({
        subject: '🚬 Budget tabac épuisé pour ce mois',
        html: layout(
          `Budget tabac : plus de quoi acheter un ${tobaccoUnit(profile.tobacco_type)}`,
          `<p>${firstName ? `${firstName}, t` : 'T'}u as dépensé <b>${eur(spentNum)}</b> sur ${eur(budget)} en tabac ce mois-ci.</p>
           <p>Il reste <b>${eur(Math.max(0, remaining))}</b> pour encore ${daysLeft} jour(s), soit moins d'un ${tobaccoUnit(profile.tobacco_type)} à ${eur(packPrice)}.</p>`,
          { href: appUrl('/?page=envelopes'), label: 'Voir mes enveloppes' }
        ),
      }));
      return;
    }
  }

  const level = pct >= 100 ? 100 : pct >= threshold ? threshold : null;
  if (!level) return;

  await sendOnce(userId, 'envelope_alert', `${envelopeId}:${month}:${level}`, ({ firstName }) => ({
    subject: level >= 100
      ? `⚠️ Enveloppe « ${env.name} » dépassée`
      : `⚡ Enveloppe « ${env.name} » à ${pct}%`,
    html: layout(
      level >= 100 ? `${env.icon || ''} ${env.name} : budget dépassé` : `${env.icon || ''} ${env.name} : ${pct}% utilisés`,
      `<p>${firstName ? `${firstName}, t` : 'T'}u as dépensé <b>${eur(spentNum)}</b> sur un budget de ${eur(budget)}.</p>
       <p>${remaining >= 0 ? `Il reste <b>${eur(remaining)}</b>` : `Dépassement de <b>${eur(-remaining)}</b>`} — encore ${daysLeft} jour(s) avant la fin du mois.</p>`,
      { href: appUrl('/?page=envelopes'), label: 'Voir mes enveloppes' }
    ),
  }));
}

function isInCurrentMonth(date, now = new Date()) {
  if (!date) return false;
  const d = date instanceof Date ? localDate(date) : String(date).slice(0, 10);
  return d.slice(0, 7) === monthKey(now) && d <= localDate(now);
}

function tobaccoUnit(type) {
  return type === 'roule' ? 'paquet de tabac à rouler' : type === 'tube' ? 'pot de tabac à tuber' : 'paquet';
}

module.exports = { checkEnvelopeAlert, isInCurrentMonth };
