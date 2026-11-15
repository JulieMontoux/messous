import { describe, it, expect } from 'vitest';
import { budgetRuleBreakdown, recommendBudgetRule, BUDGET_RULES } from './budget';

const charges = [
  { categoryId: 'housing', amount: 700 },
  { categoryId: 'savings', amount: 100 },
];
const envelopes = [
  { id: 'g', type: 'need', categoryId: 'groceries', budgetMonthly: 300 },
  { id: 'r', type: 'want', categoryId: 'restaurant', budgetMonthly: 150 },
  { id: 'v', type: 'want', categoryId: 'vacation', budgetMonthly: 80 },
  { id: 'l', type: 'saving', categoryId: 'livret', budgetMonthly: 200 },
  { id: 'a', type: 'saving', categoryId: 'assurance_vie', budgetMonthly: 150 },
];
// salaire 2000 → reste du mois = 2000 − 800 − 880 = 320
const byKey = res => Object.fromEntries(res.rows.map(r => [r.key, r]));

describe('budgetRuleBreakdown', () => {
  it('avec charges fixes (défaut) : base = salaire, charges dans les besoins', () => {
    const res = budgetRuleBreakdown('50-30-20', 2000, charges, envelopes);
    expect(res.base).toBe(2000);
    const r = byKey(res);
    expect(r.needs).toMatchObject({ actual: 700 + 300, ideal: 1000 });
    expect(r.wants).toMatchObject({ actual: 230, ideal: 600 });
    expect(r.savings).toMatchObject({ actual: 350 + 100 + 320, ideal: 400 });
  });

  it('sans charges fixes : base = salaire − charges fixes, seules les enveloppes comptent', () => {
    const res = budgetRuleBreakdown('50-30-20', 2000, charges, envelopes, { includeFixed: false });
    expect(res.base).toBe(1200);
    const r = byKey(res);
    expect(r.needs).toMatchObject({ actual: 300, ideal: 600 });
    expect(r.wants).toMatchObject({ actual: 230, ideal: 360 });
    expect(r.savings).toMatchObject({ actual: 350 + 320, ideal: 240 });
  });

  it('55/10/5/15/15 : voyages et long terme séparés', () => {
    const res = budgetRuleBreakdown('55-10-5-15-15', 2000, charges, envelopes);
    expect(res.base).toBe(2000);
    const r = byKey(res);
    expect(r.essentials).toMatchObject({ actual: 700 + 300, ideal: 1100 });
    expect(r.pleasure).toMatchObject({ actual: 150, ideal: 200 });
    expect(r.travel).toMatchObject({ actual: 80, ideal: 100 });
    expect(r.shortTerm).toMatchObject({ actual: 200 + 100 + 320, ideal: 300 });
    expect(r.longTerm).toMatchObject({ actual: 150, ideal: 300 });
    expect(res.rows.reduce((s, x) => s + x.pct, 0)).toBeCloseTo(1);
  });

  it('55/10/5/15/15 sans charges fixes', () => {
    const r = byKey(budgetRuleBreakdown('55-10-5-15-15', 2000, charges, envelopes, { includeFixed: false }));
    expect(r.essentials).toMatchObject({ actual: 300, ideal: 660 });
    expect(r.shortTerm).toMatchObject({ actual: 200 + 320, ideal: 180 });
  });

  it('règle inconnue → 50/30/20, base nulle → null', () => {
    expect(budgetRuleBreakdown('nope', 2000, charges, envelopes).rule.label).toBe('50/30/20');
    expect(budgetRuleBreakdown('55-10-5-15-15', 0, charges, envelopes)).toBeNull();
    expect(budgetRuleBreakdown('50-30-20', 800, charges, envelopes, { includeFixed: false })).toBeNull();
  });
});

describe('recommendBudgetRule', () => {
  const env = (type, budgetMonthly) => ({ type, budgetMonthly, categoryId: 'other' });

  it('envies élevées, charges raisonnables → 50/30/20 avec charges fixes', () => {
    const r = recommendBudgetRule(3000, [{ categoryId: 'housing', amount: 900 }], [env('need', 400), env('want', 700)]);
    expect(r).toMatchObject({ ruleId: '50-30-20', includeFixed: true });
    expect(r.reasons).toHaveLength(2);
  });

  it('envies faibles → 55/10/5/15/15', () => {
    const r = recommendBudgetRule(3000, [{ categoryId: 'housing', amount: 900 }], [env('need', 400), env('want', 300)]);
    expect(r).toMatchObject({ ruleId: '55-10-5-15-15', includeFixed: true });
  });

  it('besoins > 50 % → 55/10/5/15/15', () => {
    const r = recommendBudgetRule(2000, [{ categoryId: 'housing', amount: 800 }], [env('need', 400), env('want', 500)]);
    expect(r.ruleId).toBe('55-10-5-15-15');
  });

  it('charges fixes ≥ 45 % → calcul sans les charges fixes', () => {
    const r = recommendBudgetRule(1600, [{ categoryId: 'housing', amount: 800 }], [env('need', 200), env('want', 300)]);
    expect(r.includeFixed).toBe(false);
  });

  it('salaire nul → valeurs par défaut', () => {
    expect(recommendBudgetRule(0, [], [])).toEqual({ ruleId: '50-30-20', includeFixed: true, reasons: [] });
  });
});

describe('budgetRuleBreakdown : autres méthodes', () => {
  const ch = [
    { categoryId: 'housing', amount: 600 },
    { categoryId: 'loan', amount: 200 },
    { categoryId: 'savings', amount: 100 },
  ];
  const envs = [
    { id: 'g', type: 'need', categoryId: 'groceries', budgetMonthly: 300 },
    { id: 'i', type: 'need', categoryId: 'unexpected', budgetMonthly: 50 },
    { id: 'r', type: 'want', categoryId: 'restaurant', budgetMonthly: 150 },
    { id: 'e', type: 'want', categoryId: 'education', budgetMonthly: 40 },
    { id: 'd', type: 'want', categoryId: 'donations', budgetMonthly: 30 },
    { id: 'l', type: 'saving', categoryId: 'livret', budgetMonthly: 100 },
    { id: 'a', type: 'saving', categoryId: 'assurance_vie', budgetMonthly: 80 },
    { id: 'p', type: 'saving', categoryId: 'retirement', budgetMonthly: 50 },
  ];
  // salaire 2500 → charges 900, enveloppes 800, reste du mois 800
  const run = (id, opts) => byKey(budgetRuleBreakdown(id, 2500, ch, envs, opts));

  it('toutes les règles en pourcentages font 100 %', () => {
    for (const [id, rule] of Object.entries(BUDGET_RULES)) {
      if (rule.zeroBased || rule.kakeibo) continue;
      expect(rule.rows.reduce((s, r) => s + r.pct, 0), id).toBeCloseTo(1);
    }
  });

  it('80/20', () => {
    const r = run('80-20');
    expect(r.savings).toMatchObject({ actual: 230 + 100 + 800, ideal: 500 });
    expect(r.spending).toMatchObject({ actual: 800 + 570, ideal: 2000 });
  });

  it('70/20/10 : crédits et dons dans la ligne dettes', () => {
    const r = run('70-20-10');
    expect(r.living).toMatchObject({ actual: 600 + 540, ideal: 1750 });
    expect(r.debts).toMatchObject({ actual: 200 + 30, ideal: 250 });
    expect(run('70-20-10', { includeFixed: false }).debts.actual).toBe(30);
  });

  it('solution des 60 %', () => {
    const r = run('sixty');
    expect(r.committed).toMatchObject({ actual: 800 + 350, ideal: 1500 });
    expect(r.retirement.actual).toBe(50);
    expect(r.longTerm.actual).toBe(80);
    expect(r.shortTerm.actual).toBe(100 + 100 + 800);
    expect(r.fun.actual).toBe(220);
  });

  it('6 jarres', () => {
    const r = run('six-jars');
    expect(r.freedom.actual).toBe(130);
    expect(r.education.actual).toBe(40);
    expect(r.play.actual).toBe(150);
    expect(r.give).toMatchObject({ actual: 30, ideal: 125 });
  });

  it('base zéro : reste à affecter, pas d\'objectif', () => {
    const res = budgetRuleBreakdown('zero-based', 2500, ch, envs);
    expect(res.toAssign).toBe(800);
    const r = byKey(res);
    expect(r.fixed.actual).toBe(800);
    expect(r.savings).toMatchObject({ actual: 230 + 100, ideal: null, diff: null });
    expect(byKey(budgetRuleBreakdown('zero-based', 2500, ch, envs, { includeFixed: false })).fixed).toBeUndefined();
  });

  it('Kakeibo : 4 catégories + objectif d\'épargne', () => {
    const r = run('kakeibo');
    expect(r.survival.actual).toBe(800 + 300);
    expect(r.unexpected.actual).toBe(50);
    expect(r.culture.actual).toBe(40);
    expect(r.leisure.actual).toBe(180);
    expect(r.savings.ideal).toBe(250);
    expect(run('kakeibo', { savingsGoal: 400 }).savings.ideal).toBe(400);
  });

  it('crédits ≥ 10 % → 70/20/10 conseillée', () => {
    expect(recommendBudgetRule(1900, ch, envs).ruleId).toBe('70-20-10'); // crédits 200 / 1900 ≈ 11 %
    expect(recommendBudgetRule(2500, ch, envs).ruleId).not.toBe('70-20-10'); // 8 %
  });
});
