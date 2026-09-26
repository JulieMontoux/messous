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

export function actualSavingsInPeriod(transactions, envelopes, mode) {
  const savingEnvIds = new Set(envelopes.filter(e => e.type === 'saving').map(e => e.id));
  const now = new Date();
  let cutoff;
  if (mode === 'weekly') {
    cutoff = new Date(now);
    const day = now.getDay();
    cutoff.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    cutoff.setHours(0, 0, 0, 0);
  } else {
    cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return transactions
    .filter(t => savingEnvIds.has(t.envelopeId) && new Date(t.date) >= cutoff)
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

export function spentInPeriod(transactions, envelopeId, mode) {
  const now = new Date();
  let cutoff;
  if (mode === 'weekly') {
    cutoff = new Date(now);
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    cutoff.setDate(now.getDate() + diff);
    cutoff.setHours(0, 0, 0, 0);
  } else {
    cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return transactions
    .filter(t => t.envelopeId === envelopeId && new Date(t.date) >= cutoff)
    .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
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
