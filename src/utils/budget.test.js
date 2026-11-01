import { describe, it, expect } from 'vitest';
import {
  totalFixed, totalFixedExSavings, totalProgrammedSavings, totalExpenseEnvelopes, totalSavingEnvelopesBudget,
  computedSavings, totalSavings, budgetHealth, donutData, weeklyAmount, weeklyToMonthly, realSpending,
  isBankTodo, chargeFromForm, monthEndForecast, idealSplit, realSavings, spentInPeriod,
} from './budget';
import { roundUpTo, computeWithdrawal, cashInHand } from './withdrawal';
import { suggestEnvelopes, tobaccoMonthlyBudget, TOBACCO_TYPES } from '../data/defaults';
import { periodStart } from './period';

const charges = [
  { amount: 700, categoryId: 'housing' },
  { amount: 120, categoryId: 'insurance', frequency: 'yearly', dueMonth: 3 },
  { amount: 100, categoryId: 'savings' },
  { amount: 250, categoryId: 'loan', endMonth: '2020-01' },
];
const envelopes = [
  { id: 'n', type: 'need', budgetMonthly: 300 },
  { id: 'w', type: 'want', budgetMonthly: 200 },
  { id: 's', type: 'saving', budgetMonthly: 150 },
];

describe('totaux du budget', () => {
  it('charges : équivalent mensuel, épargne programmée à part, charges terminées exclues', () => {
    expect(totalFixed(charges)).toBe(810);
    expect(totalFixedExSavings(charges)).toBe(710);
    expect(totalProgrammedSavings(charges)).toBe(100);
  });
  it('enveloppes : dépenses vs épargne', () => {
    expect(totalExpenseEnvelopes(envelopes)).toBe(500);
    expect(totalSavingEnvelopesBudget(envelopes)).toBe(150);
  });
  it('reste et épargne totale', () => {
    expect(computedSavings(2000, charges, envelopes)).toBe(2000 - 810 - 650);
    expect(totalSavings(2000, charges, envelopes)).toBe(100 + 150 + 540);
    expect(totalSavings(1000, charges, envelopes)).toBe(250, 'un déficit ne réduit pas l\'épargne programmée');
  });
  it('santé du budget selon la part du reste', () => {
    expect(budgetHealth(0, charges, envelopes)).toBe('unknown');
    expect(budgetHealth(5000, charges, envelopes)).toBe('great');
    expect(budgetHealth(1600, charges, envelopes)).toBe('tight');
    expect(budgetHealth(1000, charges, envelopes)).toBe('deficit');
  });
  it('répartition : déficit affiché comme tel', () => {
    const d = donutData(1000, charges, envelopes);
    expect(d.find(x => x.name === 'Déficit').value).toBe(460);
    expect(d.find(x => x.name === 'Reste du mois')).toBeUndefined();
    expect(donutData(0, charges, envelopes)).toEqual([]);
  });
  it('conversions semaine / mois', () => {
    expect(weeklyAmount(433)).toBe(100);
    expect(weeklyToMonthly(100)).toBe(433);
  });
});

describe('opérations bancaires', () => {
  const base = { amount: -10, ignored: false, envelopeId: null, fixedChargeId: null, withdrawalId: null, advanceId: null };
  it('à classer : cartes et prélèvements, pas les virements reçus ni les opérations déjà traitées', () => {
    expect(isBankTodo({ ...base, isCard: true })).toBe(true);
    expect(isBankTodo({ ...base, isCard: false, label: 'PRLV SEPA EDF' })).toBe(true);
    expect(isBankTodo({ ...base, isCard: false, label: 'VIR M. DUPONT' })).toBe(false);
    expect(isBankTodo({ ...base, isCard: true, amount: 20 })).toBe(false);
    for (const k of ['envelopeId', 'fixedChargeId', 'withdrawalId', 'advanceId']) {
      expect(isBankTodo({ ...base, isCard: true, [k]: 'x' })).toBe(false);
    }
    expect(isBankTodo({ ...base, isCard: true, ignored: true })).toBe(false);
  });
  it('dépenses réelles : une avance n\'est pas une dépense', () => {
    const r = realSpending({
      since: '2026-11-01', envelopes: [], transactions: [],
      bankTransactions: [{ ...base, date: '2026-11-02', isCard: true, advanceId: 'a', amount: -60 }],
    });
    expect(r.total).toBe(0);
  });
});

describe('formulaire de charge fixe', () => {
  it('saisie hebdomadaire convertie en mensuel', () => {
    expect(chargeFromForm({ amount: '70', frequency: 'weekly', dueMonth: 3, endMonth: '' }))
      .toMatchObject({ amount: 303.1, frequency: 'monthly', dueMonth: null, endMonth: null });
  });
  it('annuelle : mois d\'échéance conservé, fin prévue gardée', () => {
    expect(chargeFromForm({ amount: '120', frequency: 'yearly', dueMonth: '10', endMonth: '2027-06' }))
      .toMatchObject({ amount: 120, dueMonth: 10, endMonth: '2027-06' });
  });
});

describe('tabac et suggestions d\'enveloppes', () => {
  it('budget mensuel par type (52 semaines / 12 mois)', () => {
    expect(tobaccoMonthlyBudget({ tobaccoType: 'indus', tobaccoPackPrice: 12, tobaccoPacksPerWeek: 7 })).toBe(364);
    expect(tobaccoMonthlyBudget({ tobaccoType: 'roule', tobaccoPacksPerWeek: 2 })).toBe(Math.round(TOBACCO_TYPES[1].defaultPrice * 2 * 52 / 12));
  });
  it('suggestions : tabac seulement si fumeur, d\'après le profil', () => {
    const base = { netSalary: 2500, householdAdults: 1, householdChildren: 0, pets: {}, hasCar: false, supermarket: 'lidl' };
    expect(suggestEnvelopes({ ...base, isSmoker: false }).tobacco).toBe(0);
    expect(suggestEnvelopes({ ...base, isSmoker: true, tobaccoPackPrice: 12, tobaccoPacksPerWeek: 7 }).tobacco).toBe(370);
    expect(suggestEnvelopes(base).fuel).toBe(0);
    expect(suggestEnvelopes(base).transport).toBeGreaterThan(0);
  });
});

describe('arrondis', () => {
  it('pas d\'erreur de virgule flottante', () => {
    expect(roundUpTo(0.1 + 0.2 + 9.7, 10)).toBe(10);
    expect(roundUpTo(20.000000001, 10)).toBe(20);
    expect(roundUpTo(16.6, 1)).toBe(17);
    expect(roundUpTo(0, 10)).toBe(0);
  });
  it('espèces en poche jamais négatives', () => {
    expect(cashInHand(50, 80)).toBe(0);
    expect(cashInHand(undefined, undefined)).toBe(0);
  });
});

describe('retrait hebdo calé sur un retrait, mois précédent clôturé (calcul réel, sans simulation)', () => {
  const now = new Date(2026, 10, 2); // lundi 2 novembre
  const withdrawals = [{ date: '2026-10-29', amount: 100 }];
  const savingsHistory = [{ month: '2026-10', closedAt: '2026-10-31T20:00:00Z' }];
  const transactions = [
    { envelopeId: 'n', amount: 60, date: '2026-10-30', paymentMethod: 'cash' }, // octobre clôturé : ignoré
    { envelopeId: 'n', amount: 20, date: '2026-11-01', paymentMethod: 'card' },
  ];
  it('seules les dépenses de novembre comptent, le retrait d\'octobre aussi est ignoré', () => {
    const since = periodStart('weekly', { now, withdrawals, savingsHistory });
    expect(since).toBe('2026-11-01');
    expect(spentInPeriod(transactions, 'n', 'weekly', { since })).toBe(20);
    const r = computeWithdrawal({
      envelopes: [{ id: 'n', type: 'need', budgetMonthly: 433, categoryId: 'groceries' }],
      transactions, mode: 'weekly', since, withdrawn: 0,
      idealNeeds: 0, idealWants: 0, idealSavings: 0,
    });
    // 433/mois ≈ 100/semaine − 20 dépensés = 80
    expect(r.envelopes.needs[0].toWithdraw).toBe(80);
  });
});

describe('fin de mois prévue avec report', () => {
  it('le report s\'ajoute au budget restant de l\'enveloppe', () => {
    const r = monthEndForecast({
      balance: 1000, charges: [], transactions: [],
      envelopes: [{ id: 'v', type: 'want', budgetMonthly: 50 }],
      carryovers: [{ envelopeId: 'v', month: '2026-11', amount: 30 }],
      now: new Date(2026, 10, 10),
    });
    expect(r.envelopesLeft).toBe(80);
    expect(r.forecast).toBe(920);
  });
});

describe('divers', () => {
  it('répartition idéale invalide → 50/30/20', () => {
    expect(idealSplit({ idealNeedsPct: 0, idealWantsPct: 0, idealSavingsPct: 0 })).toEqual({ needs: 0.5, wants: 0.3, savings: 0.2 });
  });
  it('épargne réelle : uniquement pour un mois clôturé, reste compté s\'il va sur un objectif', () => {
    expect(realSavings({ actualSavings: 100 })).toBeNull();
    expect(realSavings({ closedAt: 'x', actualSavings: 100, actualRemainder: 40 })).toBe(100);
    expect(realSavings({ closedAt: 'x', actualSavings: 100, actualRemainder: 40, remainderToGoalId: 'g' })).toBe(140);
  });
});
