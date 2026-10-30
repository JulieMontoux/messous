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

export function totalFixed(charges) {
  return charges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export function totalFixedExSavings(charges) {
  return charges.filter(c => c.categoryId !== 'savings').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export function totalProgrammedSavings(charges) {
  return charges.filter(c => c.categoryId === 'savings').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
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
    .filter(b => b.date >= since && b.amount < 0 && b.isCard && !b.ignored && !b.envelopeId)
    .reduce((s, b) => s + Math.abs(b.amount), 0);
  return { cash, cardClassified, unclassified, total: cash + cardClassified + unclassified };
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
