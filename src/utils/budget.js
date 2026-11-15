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
export function budgetRuleBreakdown(ruleId, salary, charges, envelopes, { includeFixed = true, savingsGoal } = {}) {
  const rule = BUDGET_RULES[ruleId] || BUDGET_RULES['50-30-20'];
  const fixed = totalFixedExSavings(charges);
  const programmed = totalProgrammedSavings(charges);
  const loans = charges.filter(c => c.categoryId === 'loan').reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const leftover = computedSavings(salary, charges, envelopes);
  const base = budgetRuleBase(salary, charges, includeFixed);
  if (base <= 0) return null;

  const x = {
    fixed: includeFixed ? fixed : 0,
    loans: includeFixed ? loans : 0,
    programmed: includeFixed ? programmed : 0,
    remainder: Math.max(0, leftover),
  };
  const rows = rule.rows
    .filter(row => !row.onlyWithFixed || includeFixed)
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

  const loans = charges.filter(c => c.categoryId === 'loan').reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
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
export function budgetMethodComparison({ salary, charges, envelopes, transactions, includeFixed = true, savingsGoal, now }) {
  const history = historyAverages(transactions, envelopes, { now });
  if (!history) return null;
  const rules = Object.entries(BUDGET_RULES).map(([id, rule]) => {
    const b = budgetRuleBreakdown(id, salary, charges, history.envelopes, { includeFixed, savingsGoal });
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
