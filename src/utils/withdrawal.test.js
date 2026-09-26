import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeWithdrawal } from './withdrawal';
import * as budgetUtils from './budget';

// Mock spentInPeriod — tests don't depend on real date logic.
// weeklyAmount kept real so weekly budget amounts are verified.
vi.mock('./budget', async () => {
  const actual = await vi.importActual('./budget');
  return { ...actual, spentInPeriod: vi.fn(() => 0) };
});

// Reset mock before each test to avoid bleed between suites.
beforeEach(() => budgetUtils.spentInPeriod.mockReturnValue(0));

const mockSpent = (map) =>
  budgetUtils.spentInPeriod.mockImplementation((_, id) => map[id] ?? 0);

const roundUp5 = v => Math.ceil(v / 5) * 5;

// Fixtures
const grocery   = { id: 'g1', type: 'need',   budgetMonthly: 300, categoryId: 'other' };
const transport = { id: 't1', type: 'need',   budgetMonthly: 100, categoryId: 'other' };
const leisure   = { id: 'l1', type: 'want',   budgetMonthly: 200, categoryId: 'other' };
const savingsE  = { id: 's1', type: 'saving', budgetMonthly: 150, categoryId: 'other' };
const tobaccoE  = { id: 'tb1', type: 'want',  budgetMonthly: 60,  categoryId: 'tobacco' };

const BASE = { idealNeeds: 1000, idealWants: 600, idealSavings: 400 };
const TXS  = []; // transactions array — irrelevant, spentInPeriod is mocked

// ─── NO SPENDING ─────────────────────────────────────────────────────────────

describe('no spending → full budget', () => {
  let r;
  beforeEach(() => {
    r = computeWithdrawal({
      envelopes: [grocery, transport, leisure, savingsE],
      transactions: TXS, mode: 'monthly', ...BASE,
    });
  });

  it('each need toWithdraw = budgetMonthly', () => {
    expect(r.envelopes.needs.find(e => e.id === 'g1').toWithdraw).toBe(300);
    expect(r.envelopes.needs.find(e => e.id === 't1').toWithdraw).toBe(100);
  });

  it('needsTotal = 400', () => {
    expect(r.envelopes.needsTotal).toBe(400);
  });

  it('want toWithdraw = 200', () => {
    expect(r.envelopes.wants[0].toWithdraw).toBe(200);
  });

  it('saving toWithdraw = 150', () => {
    expect(r.envelopes.savings[0].toWithdraw).toBe(150);
  });

  it('grandTotal = roundUp5(750) = 750', () => {
    expect(r.envelopes.grandTotal).toBe(750);
  });
});

// ─── PARTIAL SPENDING ────────────────────────────────────────────────────────

describe('partial spending → budget - spent', () => {
  let r;
  beforeEach(() => {
    mockSpent({ g1: 120, l1: 50 });
    r = computeWithdrawal({
      envelopes: [grocery, transport, leisure, savingsE],
      transactions: TXS, mode: 'monthly', ...BASE,
    });
  });

  it('grocery: 300 - 120 = 180', () => {
    expect(r.envelopes.needs.find(e => e.id === 'g1').toWithdraw).toBe(180);
  });

  it('transport: no spending → 100', () => {
    expect(r.envelopes.needs.find(e => e.id === 't1').toWithdraw).toBe(100);
  });

  it('leisure: 200 - 50 = 150', () => {
    expect(r.envelopes.wants[0].toWithdraw).toBe(150);
  });

  it('needsTotal = 280', () => {
    expect(r.envelopes.needsTotal).toBe(280);
  });

  it('grandTotal = roundUp5(280 + 150 + 150) = 580', () => {
    expect(r.envelopes.grandTotal).toBe(580);
  });
});

// ─── OVERSPEND ───────────────────────────────────────────────────────────────

describe('overspend → toWithdraw = 0, never negative', () => {
  let r;
  beforeEach(() => {
    mockSpent({ g1: 350 }); // budget 300, spent 350
    r = computeWithdrawal({
      envelopes: [grocery, transport],
      transactions: TXS, mode: 'monthly', ...BASE,
    });
  });

  it('overspent toWithdraw = 0', () => {
    expect(r.envelopes.needs.find(e => e.id === 'g1').toWithdraw).toBe(0);
  });

  it('spent recorded accurately', () => {
    expect(r.envelopes.needs.find(e => e.id === 'g1').spent).toBe(350);
  });

  it('other envelopes unaffected', () => {
    expect(r.envelopes.needs.find(e => e.id === 't1').toWithdraw).toBe(100);
  });

  it('grandTotal = roundUp5(100) = 100', () => {
    expect(r.envelopes.grandTotal).toBe(100);
  });
});

// ─── FULL SPEND ───────────────────────────────────────────────────────────────

describe('full spend → toWithdraw = 0', () => {
  it('exactly at budget', () => {
    mockSpent({ g1: 300 });
    const r = computeWithdrawal({
      envelopes: [grocery], transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.envelopes.needs[0].toWithdraw).toBe(0);
  });
});

// ─── WEEKLY MODE ─────────────────────────────────────────────────────────────

describe('weekly — budget = weeklyAmount(monthly)', () => {
  let r;
  beforeEach(() => {
    r = computeWithdrawal({
      envelopes: [grocery, transport],
      transactions: TXS, mode: 'weekly', ...BASE,
    });
  });

  // 300/4.33 = 69.28 → round5 = 70
  it('grocery weekly budget = 70', () => {
    expect(r.envelopes.needs.find(e => e.id === 'g1').budget).toBe(70);
  });

  // 100/4.33 = 23.09 → round5 = 25
  it('transport weekly budget = 25', () => {
    expect(r.envelopes.needs.find(e => e.id === 't1').budget).toBe(25);
  });

  it('toWithdraw = weekly budget when no spending', () => {
    expect(r.envelopes.needs.find(e => e.id === 'g1').toWithdraw).toBe(70);
  });
});

describe('weekly — partial spending deducted', () => {
  it('toWithdraw = weeklyBudget(70) - spent(20) = 50', () => {
    mockSpent({ g1: 20 });
    const r = computeWithdrawal({
      envelopes: [grocery], transactions: TXS, mode: 'weekly', ...BASE,
    });
    expect(r.envelopes.needs[0].toWithdraw).toBe(50);
  });
});

// ─── TOBACCO ─────────────────────────────────────────────────────────────────

describe('tobacco', () => {
  it('partial spend: 60 - 20 = 40', () => {
    mockSpent({ tb1: 20 });
    const r = computeWithdrawal({
      envelopes: [grocery, tobaccoE], transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.envelopes.tobacco.toWithdraw).toBe(40);
  });

  it('excluded from wants list', () => {
    const r = computeWithdrawal({
      envelopes: [grocery, tobaccoE], transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.envelopes.wants.find(e => e.id === 'tb1')).toBeUndefined();
  });

  it('ideal wants = max(50, idealWants(600) - tobacco(60)) = 540', () => {
    const r = computeWithdrawal({
      envelopes: [tobaccoE], transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.ideal.wantsBudget).toBe(540);
  });

  it('overspent → toWithdraw = 0', () => {
    mockSpent({ tb1: 80 });
    const r = computeWithdrawal({
      envelopes: [tobaccoE], transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.envelopes.tobacco.toWithdraw).toBe(0);
  });

  it('included in grandTotal', () => {
    mockSpent({ tb1: 20 });
    const r = computeWithdrawal({
      envelopes: [tobaccoE], transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.envelopes.grandTotal).toBe(40);
  });
});

// ─── IDEAL MODE ──────────────────────────────────────────────────────────────

describe('ideal mode — no spending', () => {
  let r;
  beforeEach(() => {
    r = computeWithdrawal({
      envelopes: [grocery, leisure], transactions: TXS, mode: 'monthly', ...BASE,
    });
  });

  it('idealNeedsBudget = round5(1000) = 1000', () => {
    expect(r.ideal.needsBudget).toBe(1000);
  });

  it('toWithdraw = budget when no spending', () => {
    expect(r.ideal.needsToWithdraw).toBe(1000);
    expect(r.ideal.wantsToWithdraw).toBe(r.ideal.wantsBudget);
    expect(r.ideal.savingsToWithdraw).toBe(r.ideal.savingsBudget);
  });
});

describe('ideal mode — spending deducted at group level', () => {
  it('needs: 1000 - needsSpent(120) = 880', () => {
    mockSpent({ g1: 120 });
    const r = computeWithdrawal({
      envelopes: [grocery, transport, leisure],
      transactions: TXS, mode: 'monthly',
      idealNeeds: 1000, idealWants: 600, idealSavings: 400,
    });
    expect(r.ideal.needsToWithdraw).toBe(880);
  });

  it('wants: pleasuresBudget(600) - wantSpent(50) = 550', () => {
    mockSpent({ l1: 50 });
    const r = computeWithdrawal({
      envelopes: [grocery, leisure],
      transactions: TXS, mode: 'monthly',
      idealNeeds: 1000, idealWants: 600, idealSavings: 400,
    });
    expect(r.ideal.wantsToWithdraw).toBe(550);
  });
});

describe('ideal mode — group fully overspent', () => {
  let r;
  beforeEach(() => {
    mockSpent({ g1: 1200 });
    r = computeWithdrawal({
      envelopes: [grocery], transactions: TXS, mode: 'monthly',
      idealNeeds: 1000, idealWants: 600, idealSavings: 400,
    });
  });

  it('needsToWithdraw = 0', () => {
    expect(r.ideal.needsToWithdraw).toBe(0);
  });

  it('grandTotal only counts non-overspent groups', () => {
    // needs=0, wants=600, savings=400 → roundUp5(1000)=1000
    expect(r.ideal.grandTotal).toBe(1000);
  });
});

// ─── GRAND TOTAL ROUNDING ────────────────────────────────────────────────────

describe('grandTotal rounds UP to nearest 5', () => {
  it('already multiple of 5 → unchanged', () => {
    const r = computeWithdrawal({
      envelopes: [{ id: 'e1', type: 'need', budgetMonthly: 300, categoryId: 'other' }],
      transactions: TXS, mode: 'monthly',
      idealNeeds: 500, idealWants: 300, idealSavings: 200,
    });
    expect(r.envelopes.grandTotal % 5).toBe(0);
  });

  it('297 → roundUp5 = 300', () => {
    mockSpent({ g1: 3 }); // budget=300, spent=3, toWithdraw=297
    const r = computeWithdrawal({
      envelopes: [grocery], transactions: TXS, mode: 'monthly',
      idealNeeds: 500, idealWants: 300, idealSavings: 200,
    });
    expect(r.envelopes.grandTotal).toBe(300);
  });

  it('201 → roundUp5 = 205 (not 200)', () => {
    mockSpent({ g1: 99 }); // budget=300, spent=99, toWithdraw=201
    const r = computeWithdrawal({
      envelopes: [grocery], transactions: TXS, mode: 'monthly',
      idealNeeds: 500, idealWants: 300, idealSavings: 200,
    });
    expect(r.envelopes.grandTotal).toBe(205);
  });
});

// ─── EDGE CASES ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('no envelopes → env grandTotal = 0', () => {
    const r = computeWithdrawal({
      envelopes: [], transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.envelopes.grandTotal).toBe(0);
  });

  it('no envelopes → ideal grandTotal = roundUp5(needs+wants+savings)', () => {
    const r = computeWithdrawal({
      envelopes: [], transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.ideal.grandTotal).toBe(roundUp5(BASE.idealNeeds + BASE.idealWants + BASE.idealSavings));
  });

  it('all envelopes overspent → grandTotal = 0', () => {
    mockSpent({ g1: 9999, l1: 9999, s1: 9999 });
    const r = computeWithdrawal({
      envelopes: [grocery, leisure, savingsE],
      transactions: TXS, mode: 'monthly', ...BASE,
    });
    expect(r.envelopes.grandTotal).toBe(0);
  });
});
