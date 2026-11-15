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

// Règles du « Budget idéal ».
// Chaque ligne : match (enveloppes rattachées) + extra (charges fixes, épargne programmée, reste du mois…).
// pct null : pas d'objectif chiffré, on affiche seulement la part (base zéro, Kakeibo).
// Ces montants « extra » valent 0 quand le calcul se fait sans les charges fixes (voir budgetRuleBreakdown).
const cat = (...ids) => e => ids.includes(e.categoryId);
const isType = t => e => e.type === t;
const not = f => e => !f(e);
const and = (...fs) => e => fs.every(f => f(e));
const noEnv = () => false;

const INVEST = cat('assurance_vie', 'retirement');
const SELF = cat('education', 'culture');
const UNEXPECTED = cat('unexpected', 'other');
const saved = x => x.programmed + x.remainder;

export const BUDGET_RULES = {
  '50-30-20': {
    label: '50/30/20',
    description: '50 % besoins · 30 % envies · 20 % épargne',
    rows: [
      { key: 'needs', label: 'Besoins', pct: 0.5, color: '#3b82f6', icon: '🧾', match: isType('need'), extra: x => x.fixed },
      { key: 'savings', label: 'Épargne', pct: 0.2, color: '#10b981', icon: '🏦', saving: true, match: isType('saving'), extra: saved },
      { key: 'wants', label: 'Plaisirs', pct: 0.3, color: '#8b5cf6', icon: '🎉', match: isType('want') },
    ],
  },
  '55-10-5-15-15': {
    label: '55/10/5/15/15',
    description: '55 % essentiel · 10 % plaisir · 5 % voyages · 15 % épargne court terme · 15 % long terme',
    rows: [
      { key: 'essentials', label: 'Essentiel', pct: 0.55, color: '#3b82f6', icon: '🧾', match: isType('need'), extra: x => x.fixed },
      { key: 'pleasure', label: 'Plaisir', pct: 0.1, color: '#8b5cf6', icon: '🎉', match: and(isType('want'), not(cat('vacation'))) },
      { key: 'travel', label: 'Voyages', pct: 0.05, color: '#f59e0b', icon: '✈️', match: cat('vacation') },
      { key: 'shortTerm', label: 'Épargne court terme', pct: 0.15, color: '#10b981', icon: '🏦', saving: true, match: and(isType('saving'), not(INVEST)), extra: saved },
      { key: 'longTerm', label: 'Épargne long terme', pct: 0.15, color: '#059669', icon: '📈', saving: true, match: INVEST },
    ],
  },
  '80-20': {
    label: '80/20',
    description: "20 % d'épargne en premier · 80 % libres pour tout le reste",
    rows: [
      { key: 'savings', label: 'Épargne (en premier)', pct: 0.2, color: '#10b981', icon: '🏦', saving: true, match: isType('saving'), extra: saved },
      { key: 'spending', label: 'Tout le reste', pct: 0.8, color: '#3b82f6', icon: '💳', match: not(isType('saving')), extra: x => x.fixed },
    ],
  },
  '70-20-10': {
    label: '70/20/10',
    description: '70 % pour vivre · 20 % épargne · 10 % dettes ou dons',
    rows: [
      { key: 'living', label: 'Vivre', pct: 0.7, color: '#3b82f6', icon: '🏠', match: and(not(isType('saving')), not(cat('donations'))), extra: x => x.fixed - x.loans },
      { key: 'savings', label: 'Épargne', pct: 0.2, color: '#10b981', icon: '🏦', saving: true, match: isType('saving'), extra: saved },
      { key: 'debts', label: 'Dettes & dons', pct: 0.1, color: '#f59e0b', icon: '🤝', match: cat('donations'), extra: x => x.loans },
    ],
  },
  'sixty': {
    label: 'Solution 60 %',
    description: '60 % dépenses engagées · 10 % retraite · 10 % long terme · 10 % court terme · 10 % plaisir',
    rows: [
      { key: 'committed', label: 'Dépenses engagées', pct: 0.6, color: '#3b82f6', icon: '🧾', match: isType('need'), extra: x => x.fixed },
      { key: 'retirement', label: 'Retraite', pct: 0.1, color: '#047857', icon: '🧓', saving: true, match: cat('retirement') },
      { key: 'longTerm', label: 'Épargne long terme', pct: 0.1, color: '#059669', icon: '📈', saving: true, match: cat('assurance_vie') },
      { key: 'shortTerm', label: 'Épargne court terme', pct: 0.1, color: '#10b981', icon: '🏦', saving: true, match: and(isType('saving'), not(INVEST)), extra: saved },
      { key: 'fun', label: 'Plaisir', pct: 0.1, color: '#8b5cf6', icon: '🎉', match: isType('want') },
    ],
  },
  'six-jars': {
    label: '6 jarres',
    description: '55 % besoins · 10 % liberté financière · 10 % épargne · 10 % formation · 10 % plaisirs · 5 % dons',
    rows: [
      { key: 'needs', label: 'Besoins', pct: 0.55, color: '#3b82f6', icon: '🧾', match: isType('need'), extra: x => x.fixed },
      { key: 'freedom', label: 'Liberté financière', pct: 0.1, color: '#047857', icon: '📈', saving: true, match: INVEST },
      { key: 'longTerm', label: 'Épargne long terme', pct: 0.1, color: '#10b981', icon: '🏦', saving: true, match: and(isType('saving'), not(INVEST)), extra: saved },
      { key: 'education', label: 'Formation', pct: 0.1, color: '#0ea5e9', icon: '📚', match: cat('education') },
      { key: 'play', label: 'Plaisirs', pct: 0.1, color: '#8b5cf6', icon: '🎉', match: and(isType('want'), not(cat('education', 'donations'))) },
      { key: 'give', label: 'Dons', pct: 0.05, color: '#f43f5e', icon: '💝', match: cat('donations') },
    ],
  },
  'zero-based': {
    label: 'Base zéro',
    description: 'Chaque euro reçoit une affectation : il doit rester 0 € à affecter',
    zeroBased: true,
    rows: [
      { key: 'fixed', label: 'Charges fixes', pct: null, color: '#64748b', icon: '📌', match: noEnv, extra: x => x.fixed, onlyWithFixed: true },
      { key: 'needs', label: 'Besoins', pct: null, color: '#3b82f6', icon: '🧾', match: isType('need') },
      { key: 'wants', label: 'Envies', pct: null, color: '#8b5cf6', icon: '🎉', match: isType('want') },
      { key: 'savings', label: 'Épargne', pct: null, color: '#10b981', icon: '🏦', saving: true, match: isType('saving'), extra: x => x.programmed },
    ],
  },
  'kakeibo': {
    label: 'Kakeibo',
    description: "4 catégories (survie, loisirs, culture, imprévus) · un objectif d'épargne · un bilan chaque mois",
    kakeibo: true,
    rows: [
      { key: 'survival', label: 'Survie', pct: null, color: '#3b82f6', icon: '🍚', match: and(isType('need'), not(UNEXPECTED)), extra: x => x.fixed },
      { key: 'leisure', label: 'Loisirs', pct: null, color: '#8b5cf6', icon: '🎉', match: and(isType('want'), not(SELF)) },
      { key: 'culture', label: 'Culture', pct: null, color: '#0ea5e9', icon: '📚', match: SELF },
      { key: 'unexpected', label: 'Imprévus', pct: null, color: '#f59e0b', icon: '🌀', match: UNEXPECTED },
      { key: 'savings', label: "Objectif d'épargne", pct: null, color: '#10b981', icon: '🏦', saving: true, goal: true, match: isType('saving'), extra: saved },
    ],
  },
};

export const DEFAULT_KAKEIBO_GOAL_PCT = 0.1;

// Mensualités de crédit actives (équivalent mensuel)
export function totalLoans(charges, month) {
  return activeCharges(charges, month).filter(c => c.categoryId === 'loan').reduce((sum, c) => sum + monthlyAmount(c), 0);
}

// Base du calcul : salaire entier, ou salaire − charges fixes (épargne programmée comprise)
export function budgetRuleBase(salary, charges, includeFixed = true) {
  const s = Number(salary) || 0;
  return includeFixed ? s : s - totalFixedExSavings(charges) - totalProgrammedSavings(charges);
}

// Montants réels vs objectifs pour une règle. Retourne null si la base est nulle ou négative.
// includeFixed (profil) : base = salaire entier, les charges fixes comptent dans les besoins
// et l'épargne programmée dans l'épargne. Sinon base = salaire − charges fixes (épargne
// programmée comprise) et seules les enveloppes comptent.
// Le reste du mois compte en épargne (court terme : argent disponible, pas bloqué),
// sauf en base zéro où c'est justement le « reste à affecter ».
// savingsGoal : objectif d'épargne Kakeibo en € (défaut 10 % de la base).
// split : répartition personnalisée de la 50/30/20 (idealSplit du profil), en fractions.
export function budgetRuleBreakdown(ruleId, salary, charges, envelopes, { includeFixed = true, savingsGoal, split } = {}) {
  const rule = BUDGET_RULES[ruleId] || BUDGET_RULES['50-30-20'];
  const fixed = totalFixedExSavings(charges);
  const programmed = totalProgrammedSavings(charges);
  const loans = totalLoans(charges);
  const leftover = computedSavings(salary, charges, envelopes);
  const base = budgetRuleBase(salary, charges, includeFixed);
  if (base <= 0) return null;

  const x = {
    fixed: includeFixed ? fixed : 0,
    loans: includeFixed ? loans : 0,
    programmed: includeFixed ? programmed : 0,
    remainder: Math.max(0, leftover),
  };
  const custom = rule === BUDGET_RULES['50-30-20'] && split ? split : null;
  const rows = rule.rows
    .filter(row => !row.onlyWithFixed || includeFixed)
    .map(row => (custom && custom[row.key] != null ? { ...row, pct: custom[row.key] } : row))
    .map(row => {
      const envs = envelopes.filter(row.match);
      const actual = totalVariableEnvelopes(envs) + (row.extra ? row.extra(x) : 0);
      const ideal = row.goal
        ? (Number(savingsGoal) > 0 ? Number(savingsGoal) : base * DEFAULT_KAKEIBO_GOAL_PCT)
        : row.pct != null ? base * row.pct : null;
      const { match: _m, extra: _e, ...rest } = row;
      return {
        ...rest,
        saving: !!row.saving,
        tip: row.pct != null ? `${Math.round(row.pct * 100)}%` : `${Math.round((actual / base) * 100)}% du budget`,
        actual,
        ideal,
        diff: ideal != null ? actual - ideal : null,
        topEnvelopes: [...envs].sort((a, b) => b.budgetMonthly - a.budgetMonthly).slice(0, 2),
      };
    });
  return { rule, base, includeFixed, rows, toAssign: rule.zeroBased ? leftover : null };
}

// Règle conseillée à partir du profil (onboarding).
// - Charges fixes ≥ 45 % du salaire : calcul sans les charges fixes, sinon l'essentiel paraît toujours dépassé.
// - Crédits ≥ 10 % du salaire (calcul avec charges fixes) : 70/20/10, avec une ligne dédiée aux dettes.
// - Besoins > 50 % de la base, ou envies déjà ≤ 20 % : 55/10/5/15/15 (plus de place pour l'essentiel, plus d'épargne).
// - Sinon 50/30/20, qui laisse plus de marge pour les envies.
export function recommendBudgetRule(salary, charges, envelopes) {
  const s = Number(salary) || 0;
  if (s <= 0) return { ruleId: '50-30-20', includeFixed: true, reasons: [] };
  const fixed = totalFixedExSavings(charges);
  const programmed = totalProgrammedSavings(charges);
  const needs = totalVariableEnvelopes(envelopes.filter(e => e.type === 'need'));
  const wants = totalVariableEnvelopes(envelopes.filter(e => e.type === 'want'));
  const pct = v => Math.round(v * 100);
  const reasons = [];

  const fixedShare = fixed / s;
  const includeFixed = fixedShare < 0.45;
  reasons.push(includeFixed
    ? `Tes charges fixes font ${pct(fixedShare)} % du salaire : on peut les compter dans l'essentiel.`
    : `Tes charges fixes font ${pct(fixedShare)} % du salaire : on calcule sur ce qui reste après elles.`);

  const base = includeFixed ? s : s - fixed - programmed;
  if (base <= 0) return { ruleId: '50-30-20', includeFixed: false, reasons };
  const needsShare = (needs + (includeFixed ? fixed : 0)) / base;
  const wantsShare = wants / base;

  const loans = totalLoans(charges);
  let ruleId = '50-30-20';
  if (includeFixed && loans / s >= 0.1) {
    ruleId = '70-20-10';
    reasons.push(`Tes crédits font ${pct(loans / s)} % du salaire : la 70/20/10 leur réserve 10 %.`);
  } else if (needsShare > 0.5) {
    ruleId = '55-10-5-15-15';
    reasons.push(`Tes besoins pèsent ${pct(needsShare)} % : la 55/10/5/15/15 leur laisse plus de place.`);
  } else if (wantsShare <= 0.2) {
    ruleId = '55-10-5-15-15';
    reasons.push(`Tes envies ne pèsent que ${pct(wantsShare)} % : tu peux viser 30 % d'épargne avec la 55/10/5/15/15.`);
  } else {
    reasons.push(`Tes envies pèsent ${pct(wantsShare)} % : la 50/30/20 te laisse 30 % pour te faire plaisir.`);
  }
  return { ruleId, includeFixed, reasons };
}

// Dépenses réelles moyennes par enveloppe sur les derniers mois complets ayant des dépenses.
// Retourne les enveloppes avec budgetMonthly = moyenne réelle, pour réutiliser budgetRuleBreakdown.
export function historyAverages(transactions, envelopes, { months = 3, now = new Date() } = {}) {
  const keys = Array.from({ length: months }, (_, i) => monthKey(new Date(now.getFullYear(), now.getMonth() - 1 - i, 1)));
  const envIds = new Set(envelopes.map(e => e.id));
  const tx = transactions.filter(t => envIds.has(t.envelopeId));
  const used = keys.filter(k => tx.some(t => t.date.startsWith(k)));
  if (!used.length) return null;

  const byEnvMonth = {};
  for (const t of tx) {
    const k = t.date.slice(0, 7);
    if (!used.includes(k)) continue;
    byEnvMonth[t.envelopeId] ??= {};
    byEnvMonth[t.envelopeId][k] = (byEnvMonth[t.envelopeId][k] || 0) + (Number(t.amount) || 0);
  }
  const avg = id => Math.round(Object.values(byEnvMonth[id] || {}).reduce((s, v) => s + v, 0) / used.length);
  const typeTotal = (type, k) => envelopes
    .filter(e => e.type === type)
    .reduce((s, e) => s + (byEnvMonth[e.id]?.[k] || 0), 0);

  return {
    months: used,
    envelopes: envelopes.map(e => ({ ...e, budgetMonthly: avg(e.id) })),
    perMonth: used.map(k => ({
      month: k,
      needs: Math.round(typeTotal('need', k)),
      wants: Math.round(typeTotal('want', k)),
      savings: Math.round(typeTotal('saving', k)),
    })),
  };
}

// Écart moyen (en % de la base) entre les montants réels et les objectifs d'une règle.
// Dépenses : on compte l'écart dans les deux sens ; épargne : seulement ce qui manque.
// null pour les méthodes sans objectifs en % (base zéro, Kakeibo).
export function ruleFitScore(breakdown) {
  if (!breakdown || breakdown.rule.zeroBased || breakdown.rule.kakeibo) return null;
  const rows = breakdown.rows.filter(r => r.ideal != null);
  const gaps = rows.map(r => (r.saving ? Math.max(0, -r.diff) : Math.abs(r.diff)) / breakdown.base);
  return Math.round((gaps.reduce((s, g) => s + g, 0) / rows.length) * 1000) / 10;
}

// Compare toutes les méthodes aux dépenses réelles (données envoyées à l'IA).
export function budgetMethodComparison({ salary, charges, envelopes, transactions, includeFixed = true, savingsGoal, split, now }) {
  const history = historyAverages(transactions, envelopes, { now });
  if (!history) return null;
  const rules = Object.entries(BUDGET_RULES).map(([id, rule]) => {
    const b = budgetRuleBreakdown(id, salary, charges, history.envelopes, { includeFixed, savingsGoal, split });
    return {
      id,
      label: rule.label,
      description: rule.description,
      score: ruleFitScore(b),
      toAssign: b?.toAssign != null ? Math.round(b.toAssign) : null,
      rows: (b?.rows || []).map(r => ({
        label: r.label,
        pct: r.pct,
        actual: Math.round(r.actual),
        ideal: r.ideal != null ? Math.round(r.ideal) : null,
      })),
    };
  });
  const scored = rules.filter(r => r.score != null).sort((a, b) => a.score - b.score);
  return { months: history.months, perMonth: history.perMonth, rules, best: scored[0]?.id || '50-30-20' };
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

// Tabac : achats du mois (≈ nombre de paquets d'après le prix) et compteur d'arrêt
export function tobaccoStats({ profile, envelopes, transactions, now = new Date() }) {
  const price = Number(profile.tobaccoPackPrice) || 0;
  const perWeek = Number(profile.tobaccoPacksPerWeek) || 0;
  const env = envelopes.find(e => e.categoryId === 'tobacco');
  const month = monthKey(now);
  const spentMonth = env
    ? transactions.filter(t => t.envelopeId === env.id && String(t.date).startsWith(month)).reduce((s, t) => s + Number(t.amount), 0)
    : 0;
  const unitsMonth = price > 0 ? spentMonth / price : 0;
  const expectedSoFar = perWeek * (now.getDate() / 7);

  let quit = null;
  if (profile.tobaccoQuitDate) {
    const days = Math.max(0, daysBetween(String(profile.tobaccoQuitDate).slice(0, 10), toLocalDate(now)));
    quit = { days, saved: Math.round(days * (perWeek / 7) * price), unitsAvoided: Math.round(days * (perWeek / 7)) };
  }
  return { spentMonth, unitsMonth, expectedSoFar, quit };
}
