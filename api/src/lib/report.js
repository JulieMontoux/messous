const { pool } = require('../db');
const { layout, appUrl } = require('./mailer');

const eur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month) {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

// Données du bilan d'un mois : dépenses par enveloppe vs budget, épargne, comparaison M-1
async function buildMonthlyReport(userId, month) {
  const prev = shiftMonth(month, -1);
  const [envs, spentRows, carryRows, snapRows] = await Promise.all([
    pool.query('SELECT * FROM envelopes WHERE user_id = $1 ORDER BY sort_order, created_at', [userId]),
    pool.query(
      `SELECT envelope_id, TO_CHAR(date, 'YYYY-MM') AS month, SUM(amount) AS total
       FROM transactions WHERE user_id = $1 AND TO_CHAR(date, 'YYYY-MM') IN ($2, $3)
       GROUP BY envelope_id, month`,
      [userId, month, prev]
    ),
    pool.query('SELECT envelope_id, amount FROM envelope_carryovers WHERE user_id = $1 AND month = $2', [userId, month]),
    pool.query('SELECT * FROM savings_history WHERE user_id = $1 AND month = $2', [userId, month]),
  ]);

  const spent = (envId, m) => Number(spentRows.rows.find(r => r.envelope_id === envId && r.month === m)?.total || 0);
  const carry = envId => Number(carryRows.rows.find(r => r.envelope_id === envId)?.amount || 0);

  const lines = envs.rows.filter(e => e.type !== 'saving').map(e => {
    const budget = Number(e.budget_monthly) + carry(e.id);
    const s = spent(e.id, month);
    return { name: e.name, icon: e.icon || '', budget, spent: s, diff: budget - s, previous: spent(e.id, prev) };
  });
  const totalSpent = lines.reduce((t, l) => t + l.spent, 0);
  const totalBudget = lines.reduce((t, l) => t + l.budget, 0);
  const previousSpent = lines.reduce((t, l) => t + l.previous, 0);
  const snap = snapRows.rows[0];
  const plannedSavings = snap ? Number(snap.total_savings) : null;
  const realSavings = snap?.closed_at
    ? Number(snap.actual_savings || 0) + (snap.remainder_to_goal_id ? Number(snap.actual_remainder || 0) : 0)
    : null;

  return {
    month,
    lines,
    totalSpent,
    totalBudget,
    previousSpent,
    over: lines.filter(l => l.diff < 0).sort((a, b) => a.diff - b.diff),
    plannedSavings,
    realSavings,
  };
}

function renderMonthlyReport(r, firstName) {
  const evolution = r.previousSpent > 0
    ? Math.round(((r.totalSpent - r.previousSpent) / r.previousSpent) * 100)
    : null;
  const rows = r.lines
    .filter(l => l.budget > 0 || l.spent > 0)
    .map(l => `<tr>
      <td style="padding:4px 0">${l.icon} ${l.name}</td>
      <td style="padding:4px 0;text-align:right">${eur(l.spent)} / ${eur(l.budget)}</td>
      <td style="padding:4px 0 4px 8px;text-align:right;color:${l.diff < 0 ? '#e11d48' : '#059669'}">${l.diff < 0 ? '−' : '+'}${eur(Math.abs(l.diff))}</td>
    </tr>`).join('');
  const savings = r.realSavings != null
    ? `<p>🐷 Épargne réelle : <b>${eur(r.realSavings)}</b>${r.plannedSavings != null ? ` (prévu ${eur(r.plannedSavings)})` : ''}</p>`
    : r.plannedSavings != null
      ? `<p>🐷 Épargne prévue : <b>${eur(r.plannedSavings)}</b> — pense à clôturer le mois pour noter le réel.</p>`
      : '';

  return {
    subject: `📊 Ton bilan de ${monthLabel(r.month)}`,
    html: layout(
      `Bilan de ${monthLabel(r.month)}`,
      `<p>${firstName ? `${firstName}, v` : 'V'}oici ton mois en un coup d'œil.</p>
       <p>💸 Dépensé : <b>${eur(r.totalSpent)}</b> sur ${eur(r.totalBudget)} d'enveloppes
       ${evolution != null ? `(<b>${evolution > 0 ? '+' : ''}${evolution} %</b> vs ${monthLabel(shiftMonth(r.month, -1))})` : ''}</p>
       ${savings}
       ${r.over.length ? `<p>⚠️ Dépassements : ${r.over.map(l => `${l.name} (${eur(-l.diff)})`).join(', ')}</p>` : '<p>✅ Aucune enveloppe dépassée, bravo !</p>'}
       <table style="width:100%;font-size:14px;border-collapse:collapse;margin-top:8px">${rows}</table>`,
      { href: appUrl('/?page=history'), label: 'Voir mon historique' }
    ),
    push: {
      title: `📊 Bilan de ${monthLabel(r.month)}`,
      body: `${eur(r.totalSpent)} dépensés sur ${eur(r.totalBudget)}${r.over.length ? ` · ${r.over.length} enveloppe(s) dépassée(s)` : ' · aucune enveloppe dépassée'}`,
      url: '/?page=history',
    },
  };
}

module.exports = { buildMonthlyReport, renderMonthlyReport, shiftMonth };
