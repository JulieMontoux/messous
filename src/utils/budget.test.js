import { describe, it, expect } from 'vitest';
import { budgetRuleBreakdown } from './budget';

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
  it('50/30/20 : base = salaire − charges fixes', () => {
    const res = budgetRuleBreakdown('50-30-20', 2000, charges, envelopes);
    expect(res.base).toBe(1200);
    const r = byKey(res);
    expect(r.needs).toMatchObject({ actual: 300, ideal: 600 });
    expect(r.wants).toMatchObject({ actual: 230, ideal: 360 });
    expect(r.savings).toMatchObject({ actual: 350 + 320, ideal: 240 });
  });

  it('55/10/5/15/15 : base = salaire entier, voyages et long terme séparés', () => {
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

  it('règle inconnue → 50/30/20, base nulle → null', () => {
    expect(budgetRuleBreakdown('nope', 2000, charges, envelopes).rule.label).toBe('50/30/20');
    expect(budgetRuleBreakdown('55-10-5-15-15', 0, charges, envelopes)).toBeNull();
  });
});
