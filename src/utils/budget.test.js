import { describe, it, expect } from 'vitest';
import { budgetRuleBreakdown, recommendBudgetRule } from './budget';

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
