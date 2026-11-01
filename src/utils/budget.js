import { periodStart, toLocalDate, daysInMonth, daysBetween, monthKey } from './period';

export function fmt(amount) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function fmtDec(amount) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount || 0);
}

// Charges fixes : le montant est celui d'une échéance ; une charge annuelle pèse 1/12 par mois dans le budget
export const FREQUENCY_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

export function monthlyAmount(charge) {
  return (Number(charge.amount) || 0) / (FREQUENCY_MONTHS[charge.frequency] || 1);
}

// Une charge trimestrielle/annuelle tombe-t-elle ce mois-ci ?
export function isDueInMonth(charge, month1to12) {
  const freq = charge.frequency || 'monthly';
  if (freq === 'monthly' || !charge.dueMonth) return true;
  if (freq === 'yearly') return charge.dueMonth === month1to12;
  return (month1to12 - charge.dueMonth + 12) % 3 === 0;
}

// Une charge avec un mois de fin (crédit, engagement…) compte jusqu'à ce mois inclus
export function isChargeActive(charge, month = monthKey()) {
  return !charge.endMonth || charge.endMonth >= month;
}

// Nombre de mois de paiement restants, mois en cours inclus (null = sans fin)
export function monthsLeft(charge, month = monthKey()) {
  if (!charge.endMonth) return null;
  const [ey, em] = charge.endMonth.split('-').map(Number);
  const [y, m] = month.split('-').map(Number);
  return Math.max(0, (ey * 12 + em) - (y * 12 + m) + 1);
}

export function activeCharges(charges, month = monthKey()) {
  return charges.filter(c => isChargeActive(c, month));
}

export function totalFixed(charges, month) {
  return activeCharges(charges, month).reduce((sum, c) => sum + monthlyAmount(c), 0);
}

export function totalFixedExSavings(charges, month) {
  return activeCharges(charges, month).filter(c => c.categoryId !== 'savings').reduce((sum, c) => sum + monthlyAmount(c), 0);
}

export function totalProgrammedSavings(charges, month) {
  return activeCharges(charges, month).filter(c => c.categoryId === 'savings').reduce((sum, c) => sum + monthlyAmount(c), 0);
}

export function totalVariableEnvelopes(envelopes) {
  return envelopes.reduce((sum, e) => sum + (Number(e.budgetMonthly) || 0), 0);
}

export function totalExpenseEnvelopes(envelopes) {
  return envelopes.filter(e => e.type !== 'saving').reduce((sum, e) => sum + (Number(e.budgetMonthly) || 0), 0);
}

export function totalSavingEnvelopesBudget(envelopes) {
  return envelopes.filter(e => e.type === 'saving').reduce((sum, e) => sum + (Number(e.budgetMonthly) || 0), 0);
}

export function actualSavingsInPeriod(transactions, envelopes, mode, opts = {}) {
  const savingEnvIds = new Set(envelopes.filter(e => e.type === 'saving').map(e => e.id));
  const since = opts.since || periodStart(mode, opts);
  return transactions
    .filter(t => savingEnvIds.has(t.envelopeId) && t.date >= since)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}

// What's left after everything — potential end-of-month savings
export function computedSavings(salary, charges, envelopes) {
  return (Number(salary) || 0) - totalFixed(charges) - totalVariableEnvelopes(envelopes);
}

// Total savings = programmed transfers + saving envelopes budget + end-of-month remainder
export function totalSavings(salary, charges, envelopes) {
  return totalProgrammedSavings(charges)
    + totalSavingEnvelopesBudget(envelopes)
    + Math.max(0, computedSavings(salary, charges, envelopes));
}

export function weeklyToMonthly(weekly) {
  return Math.round(weekly * 4.33 * 100) / 100;
}

export function weeklyAmount(monthly) {
  return Math.round((monthly / 4.33) * 10) / 10;
}

export function budgetHealth(salary, charges, envelopes) {
  if (!salary) return 'unknown';
  const savings = computedSavings(salary, charges, envelopes);
  const pct = savings / salary;
  if (pct >= 0.2) return 'great';
  if (pct >= 0.1) return 'good';
  if (pct >= 0) return 'tight';
  return 'deficit';
}

export const HEALTH_CONFIG = {
  great: { label: 'Excellent', bg: 'bg-savings/10', text: 'text-savings', dot: 'bg-savings' },
  good: { label: 'Correct', bg: 'bg-blue-50', text: 'text-blue-600', dot: 'bg-blue-500' },
  tight: { label: 'Serré', bg: 'bg-warn/10', text: 'text-warn', dot: 'bg-warn' },
  deficit: { label: 'Déficit !', bg: 'bg-danger/10', text: 'text-danger', dot: 'bg-danger' },
  unknown: { label: '—', bg: 'bg-slate-50', text: 'text-slate-400', dot: 'bg-slate-300' },
};

// Dépenses d'une enveloppe sur la période (mois ou semaine budgétaire).
// opts.since : début de période explicite · opts.method : 'cash' | 'card' pour filtrer
export function spentInPeriod(transactions, envelopeId, mode, opts = {}) {
  const since = opts.since || periodStart(mode, opts);
  return transactions
    .filter(t => t.envelopeId === envelopeId && t.date >= since
      && (!opts.method || (t.paymentMethod || 'cash') === opts.method))
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
}

export function transactionsInPeriod(transactions, envelopeId, since) {
  return transactions.filter(t => t.envelopeId === envelopeId && t.date >= since);
}

// Prévision de fin de période au rythme actuel.
// Sur la période en cours on reste « chill » : seul un dépassement réel est alarmant,
// un rythme soutenu n'est qu'une indication (et rien n'est extrapolé les premiers jours).
export function envelopeForecast({ budget, spent, since, periodDays, now = new Date() }) {
  const elapsedDays = Math.min(periodDays, Math.max(1, daysBetween(since, toLocalDate(now)) + 1));
  const ratio = elapsedDays / periodDays;
  const projected = ratio >= 0.25 ? spent / ratio : null;
  const remaining = budget - spent;
  const daysLeft = periodDays - elapsedDays;
  let status = 'ok';
  if (budget > 0 && spent > budget) status = 'over';
  else if (budget > 0 && projected != null && projected > budget * 1.1) status = 'pace';
  return {
    projected,
    remaining,
    daysLeft,
    perDayLeft: daysLeft > 0 ? Math.max(0, remaining) / daysLeft : Math.max(0, remaining),
    status,
  };
}

export const FORECAST_LABEL = {
  ok: { text: 'Dans les clous', cls: 'text-savings' },
  pace: { text: 'Rythme un peu soutenu — rien de grave, le mois est en cours', cls: 'text-warn' },
  over: { text: 'Budget dépassé', cls: 'text-danger' },
};

export function periodDaysFor(mode, now = new Date()) {
  return mode === 'weekly' ? 7 : daysInMonth(now);
}

// Dépenses réelles en temps réel : dépenses d'enveloppes (espèces + carte classées)
// + paiements carte de la banque pas encore classés.
export function realSpending({ transactions, envelopes, bankTransactions = [], since }) {
  const savingIds = new Set(envelopes.filter(e => e.type === 'saving').map(e => e.id));
  const tx = transactions.filter(t => t.date >= since && !savingIds.has(t.envelopeId));
  const cash = tx.filter(t => (t.paymentMethod || 'cash') === 'cash').reduce((s, t) => s + Number(t.amount), 0);
  const cardClassified = tx.filter(t => t.paymentMethod === 'card').reduce((s, t) => s + Number(t.amount), 0);
  const unclassified = bankTransactions
    .filter(b => b.date >= since && b.amount < 0 && b.isCard && !b.ignored && !b.envelopeId && !b.fixedChargeId && !b.withdrawalId && !b.advanceId)
    .reduce((s, b) => s + Math.abs(b.amount), 0);
  return { cash, cardClassified, unclassified, total: cash + cardClassified + unclassified };
}

// Opération bancaire à classer : paiement carte ou prélèvement, ni classé ni ignoré
export function isBankTodo(b) {
  return b.amount < 0 && !b.ignored && !b.envelopeId && !b.fixedChargeId && !b.withdrawalId && !b.advanceId
    && (b.isCard || /PRLV|PRELEV/i.test(b.label || ''));
}

export function isCurrentMonth(month, now = new Date()) {
  return month === monthKey(now);
}

export function savingsRate(salary, charges, envelopes) {
  if (!salary) return 0;
  return Math.max(0, (computedSavings(salary, charges, envelopes) / salary) * 100);
}

export function donutData(salary, charges, envelopes) {
  if (!salary) return [];
  const fixedExSav = totalFixedExSavings(charges);
  const programmed = totalProgrammedSavings(charges);
  const remainder = computedSavings(salary, charges, envelopes);

  const needsTotal = envelopes.filter(e => e.type === 'need').reduce((s, e) => s + (Number(e.budgetMonthly) || 0), 0);
  const wantsTotal = envelopes.filter(e => e.type === 'want').reduce((s, e) => s + (Number(e.budgetMonthly) || 0), 0);
  const savingEnvTotal = totalSavingEnvelopesBudget(envelopes);

  const data = [];
  if (fixedExSav > 0) data.push({ name: 'Charges fixes', value: fixedExSav, color: '#64748b' });
  if (needsTotal > 0) data.push({ name: 'Besoins', value: needsTotal, color: '#3b82f6' });
  if (wantsTotal > 0) data.push({ name: 'Envies', value: wantsTotal, color: '#8b5cf6' });
  if (programmed > 0) data.push({ name: 'Épargne programmée', value: programmed, color: '#059669' });
  if (savingEnvTotal > 0) data.push({ name: 'Enveloppes épargne', value: savingEnvTotal, color: '#10b981' });
  if (remainder > 0) data.push({ name: 'Reste du mois', value: remainder, color: '#6ee7b7' });
  if (remainder < 0) data.push({ name: 'Déficit', value: Math.abs(remainder), color: '#f43f5e' });

  return data;
}

// Épargne réellement constituée sur un mois clôturé (versements + reste placé sur un objectif)
export function realSavings(snap) {
  if (!snap?.closedAt) return null;
  return (snap.actualSavings || 0) + (snap.remainderToGoalId ? (snap.actualRemainder || 0) : 0);
}

// Normalise le formulaire en charge à enregistrer
export function chargeFromForm(form) {
  const raw = Number(form.amount);
  const endMonth = form.endMonth || null;
  if (form.frequency === 'weekly') return { ...form, frequency: 'monthly', dueMonth: null, endMonth, amount: weeklyToMonthly(raw) };
  return { ...form, amount: raw, endMonth, dueMonth: form.frequency === 'monthly' ? null : Number(form.dueMonth) };
}

// Répartition du budget idéal (profil), en fractions : 50/30/20 par défaut
export function idealSplit(profile = {}) {
  const needs = Number(profile.idealNeedsPct ?? 50);
  const wants = Number(profile.idealWantsPct ?? 30);
  const savings = Number(profile.idealSavingsPct ?? 20);
  const total = needs + wants + savings;
  if (!(total > 0)) return { needs: 0.5, wants: 0.3, savings: 0.2 };
  return { needs: needs / total, wants: wants / total, savings: savings / total };
}

export const pctLabel = f => `${Math.round(f * 100)} %`;

// Reste reporté sur une enveloppe pour un mois donné (choisi à la clôture du mois précédent)
export function carryoverFor(carryovers = [], envelopeId, month = monthKey()) {
  return carryovers
    .filter(c => c.envelopeId === envelopeId && c.month === month)
    .reduce((s, c) => s + Number(c.amount), 0);
}

// Jour habituel de prélèvement d'une charge, appris du dernier paiement bancaire rattaché
export function chargeDueDay(charge) {
  return charge.lastPaidAt ? Number(String(charge.lastPaidAt).slice(8, 10)) : null;
}

// Charge déjà payée pour l'échéance du mois en cours ?
export function chargePaidThisMonth(charge, now = new Date()) {
  if (!charge.lastPaidAt) return false;
  const paid = String(charge.lastPaidAt).slice(0, 10);
  const span = { quarterly: 3, yearly: 12 }[charge.frequency] || 1;
  const [py, pm] = paid.split('-').map(Number);
  const monthsAgo = (now.getFullYear() - py) * 12 + (now.getMonth() + 1 - pm);
  return monthsAgo < span;
}

// Prélèvements restant à passer ce mois-ci (charges actives, dues ce mois, pas encore payées)
export function upcomingCharges(charges, now = new Date()) {
  const month = monthKey(now);
  return charges
    .filter(c => isChargeActive(c, month) && isDueInMonth(c, now.getMonth() + 1) && !chargePaidThisMonth(c, now))
    .map(c => ({ ...c, dueDay: chargeDueDay(c) }))
    .sort((a, b) => (a.dueDay ?? 99) - (b.dueDay ?? 99));
}

// Solde prévisionnel de fin de mois :
// solde actuel − prélèvements à venir − budget d'enveloppes pas encore dépensé (hors espèces déjà
// retirées, qui ont déjà quitté le compte) − épargne d'enveloppes pas encore versée
export function monthEndForecast({ balance, charges, envelopes, transactions, carryovers = [], withdrawals = [], now = new Date() }) {
  const month = monthKey(now);
  const since = `${month}-01`;
  const upcoming = upcomingCharges(charges, now);
  const chargesLeft = upcoming.reduce((s, c) => s + Number(c.amount), 0);

  let envelopesLeft = 0;
  let savingsLeft = 0;
  for (const e of envelopes) {
    const budget = Number(e.budgetMonthly) + carryoverFor(carryovers, e.id, month);
    const spent = transactions.filter(t => t.envelopeId === e.id && t.date >= since).reduce((s, t) => s + Number(t.amount), 0);
    const left = Math.max(0, budget - spent);
    if (e.type === 'saving') savingsLeft += left; else envelopesLeft += left;
  }
  const withdrawn = withdrawals.filter(w => w.date >= since).reduce((s, w) => s + Number(w.amount), 0);
  const cashSpent = transactions
    .filter(t => t.date >= since && (t.paymentMethod || 'cash') === 'cash')
    .reduce((s, t) => s + Number(t.amount), 0);
  const cashInPocket = Math.max(0, withdrawn - cashSpent);
  const envelopesFromAccount = Math.max(0, envelopesLeft - cashInPocket);

  return {
    balance,
    upcoming,
    chargesLeft,
    envelopesLeft: envelopesFromAccount,
    savingsLeft,
    forecast: balance == null ? null : balance - chargesLeft - envelopesFromAccount - savingsLeft,
  };
}

// Dépenses par mois sur les `count` derniers mois (mois en cours inclus), par enveloppe ou au total
export function monthlySpendingSeries(transactions, envelopes, { envelopeId = null, count = 12, now = new Date() } = {}) {
  const savingIds = new Set(envelopes.filter(e => e.type === 'saving').map(e => e.id));
  const months = [];
  for (let i = count - 1; i >= 0; i--) months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  const totals = Object.fromEntries(months.map(m => [m, 0]));
  for (const t of transactions) {
    const m = String(t.date).slice(0, 7);
    if (!(m in totals)) continue;
    if (envelopeId ? t.envelopeId !== envelopeId : savingIds.has(t.envelopeId)) continue;
    totals[m] += Number(t.amount) || 0;
  }
  return months.map(m => ({ month: m, total: Math.round(totals[m] * 100) / 100 }));
}

// Évolution par enveloppe : dernier mois terminé vs moyenne des 3 mois précédents
export function spendingTrends(transactions, envelopes, now = new Date()) {
  return envelopes
    .filter(e => e.type !== 'saving')
    .map(e => {
      const series = monthlySpendingSeries(transactions, envelopes, { envelopeId: e.id, count: 5, now });
      const last = series[3].total;
      const prev = series.slice(0, 3).map(x => x.total);
      const avg = prev.reduce((s, v) => s + v, 0) / 3;
      return { envelope: e, last, avg, change: avg > 0 ? (last - avg) / avg : null };
    })
    .filter(t => t.last > 0 || t.avg > 0)
    .sort((a, b) => Math.abs(b.last - b.avg) - Math.abs(a.last - a.avg));
}

// Plan d'un objectif : versement nécessaire pour tenir la date, date atteinte au rythme prévu, retard
export function goalPlan(goal, now = new Date()) {
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  const contribution = Number(goal.monthlyContribution) || 0;
  let monthsLeft = null;
  if (goal.targetDate) {
    const [y, m] = goal.targetDate.split('-').map(Number);
    monthsLeft = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  }
  const needed = remaining > 0 && monthsLeft != null ? remaining / Math.max(1, monthsLeft) : null;
  let reachMonth = null;
  if (remaining > 0 && contribution > 0) {
    const n = Math.ceil(remaining / contribution);
    reachMonth = monthKey(new Date(now.getFullYear(), now.getMonth() + n, 1));
  }
  const late = remaining > 0 && needed != null && (contribution === 0 ? monthsLeft <= 0 : contribution + 0.5 < needed);
  return { remaining, contribution, monthsLeft, needed, reachMonth, late, shortfall: late && needed != null ? needed - contribution : 0 };
}
