import { describe, it, expect } from 'vitest';
import { weekStart, periodStart, periodEnd, mondayOf, lastWithdrawal, isLastDayOfMonth, addDays, isCutByClosure } from './period';
import { spentInPeriod, envelopeForecast, realSpending, monthlyAmount, totalFixed, isDueInMonth, monthsLeft } from './budget';

// Jeudi 30 octobre 2026
const NOW = new Date(2026, 9, 30, 12, 0);

describe('semaine budgétaire', () => {
  it('sans retrait → lundi', () => {
    expect(mondayOf(NOW)).toBe('2026-10-26');
    expect(weekStart(NOW, [])).toBe('2026-10-26');
  });

  it('calée sur la date du dernier retrait', () => {
    expect(weekStart(NOW, [{ date: '2026-10-28' }])).toBe('2026-10-28');
  });

  it('cycles de 7 jours si le retrait date de plus d\'une semaine', () => {
    // retrait le samedi 17 → cycles 17, 24, 31 : on est dans le cycle du 24
    expect(weekStart(NOW, [{ date: '2026-10-17' }])).toBe('2026-10-24');
  });

  it('ignore les retraits futurs', () => {
    expect(lastWithdrawal([{ date: '2026-11-02' }, { date: '2026-10-20' }], NOW).date).toBe('2026-10-20');
  });

  it('période mensuelle', () => {
    expect(periodStart('monthly', { now: NOW })).toBe('2026-10-01');
    expect(periodEnd('monthly', { now: NOW })).toBe('2026-10-31');
    expect(periodEnd('weekly', { now: NOW, withdrawals: [{ date: '2026-10-28' }] })).toBe('2026-11-03');
  });

  it('dernier jour du mois', () => {
    expect(isLastDayOfMonth(NOW)).toBe(false);
    expect(isLastDayOfMonth(new Date(2026, 9, 31))).toBe(true);
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
  });
});

describe('spentInPeriod', () => {
  const txs = [
    { envelopeId: 'a', amount: 10, date: '2026-10-27', paymentMethod: 'cash' },
    { envelopeId: 'a', amount: 20, date: '2026-10-29', paymentMethod: 'card' },
    { envelopeId: 'a', amount: 40, date: '2026-09-30' },
    { envelopeId: 'b', amount: 99, date: '2026-10-29' },
  ];

  it('depuis une date explicite', () => {
    expect(spentInPeriod(txs, 'a', 'weekly', { since: '2026-10-28' })).toBe(20);
    expect(spentInPeriod(txs, 'a', 'monthly', { now: NOW })).toBe(30);
  });

  it('filtre par moyen de paiement (espèces par défaut)', () => {
    expect(spentInPeriod(txs, 'a', 'monthly', { now: NOW, method: 'cash' })).toBe(10);
    expect(spentInPeriod(txs, 'a', 'monthly', { now: NOW, method: 'card' })).toBe(20);
  });
});

describe('envelopeForecast', () => {
  it('pas d\'extrapolation en tout début de période', () => {
    const f = envelopeForecast({ budget: 300, spent: 100, since: '2026-10-01', periodDays: 31, now: new Date(2026, 9, 3) });
    expect(f.projected).toBeNull();
    expect(f.status).toBe('ok');
  });

  it('rythme soutenu → statut « pace », pas « over »', () => {
    const f = envelopeForecast({ budget: 300, spent: 200, since: '2026-10-01', periodDays: 31, now: new Date(2026, 9, 15) });
    expect(f.status).toBe('pace');
    expect(Math.round(f.projected)).toBe(413);
  });

  it('dépassement réel → « over »', () => {
    const f = envelopeForecast({ budget: 300, spent: 320, since: '2026-10-01', periodDays: 31, now: NOW });
    expect(f.status).toBe('over');
    expect(f.remaining).toBe(-20);
  });
});

describe('realSpending', () => {
  it('additionne espèces, carte classée et carte non classée, hors épargne', () => {
    const r = realSpending({
      since: '2026-10-01',
      envelopes: [{ id: 'a', type: 'need' }, { id: 's', type: 'saving' }],
      transactions: [
        { envelopeId: 'a', amount: 10, date: '2026-10-02', paymentMethod: 'cash' },
        { envelopeId: 'a', amount: 25, date: '2026-10-03', paymentMethod: 'card' },
        { envelopeId: 's', amount: 100, date: '2026-10-03', paymentMethod: 'card' },
      ],
      bankTransactions: [
        { date: '2026-10-04', amount: -12, isCard: true, envelopeId: null, ignored: false },
        { date: '2026-10-04', amount: -50, isCard: true, envelopeId: null, ignored: true },
        { date: '2026-10-04', amount: 2000, isCard: false, envelopeId: null, ignored: false },
        { date: '2026-10-03', amount: -25, isCard: true, envelopeId: 'a', ignored: false },
      ],
    });
    expect(r).toEqual({ cash: 10, cardClassified: 25, unclassified: 12, total: 47 });
  });
});

describe('charges fixes non mensuelles', () => {

  it('équivalent mensuel', () => {
    expect(monthlyAmount({ amount: 120, frequency: 'yearly' })).toBe(10);
    expect(monthlyAmount({ amount: 90, frequency: 'quarterly' })).toBe(30);
    expect(monthlyAmount({ amount: 50 })).toBe(50);
    expect(totalFixed([{ amount: 700 }, { amount: 120, frequency: 'yearly' }])).toBe(710);
  });

  it("mois d'échéance", () => {
    expect(isDueInMonth({ frequency: 'yearly', dueMonth: 10 }, 10)).toBe(true);
    expect(isDueInMonth({ frequency: 'yearly', dueMonth: 10 }, 11)).toBe(false);
    expect(isDueInMonth({ frequency: 'quarterly', dueMonth: 1 }, 10)).toBe(true);
    expect(isDueInMonth({ frequency: 'quarterly', dueMonth: 1 }, 11)).toBe(false);
  });
});

describe('realSpending ignore les paiements rattachés à une charge fixe', () => {
  it('abonnement annuel classé en charge fixe', () => {
    const r = realSpending({
      since: '2026-10-01', envelopes: [], transactions: [],
      bankTransactions: [{ date: '2026-10-05', amount: -99, isCard: true, envelopeId: null, fixedChargeId: 'f1', ignored: false }],
    });
    expect(r.total).toBe(0);
  });
});

describe('mois précédent clôturé', () => {
  // Dimanche 1er novembre 2026, dernier retrait le jeudi 29 octobre
  const nov1 = new Date(2026, 10, 1, 10, 0);
  const withdrawals = [{ date: '2026-10-29' }];
  const closedOct = [{ month: '2026-10', closedAt: '2026-10-31T20:00:00Z' }];

  it('sans clôture, la semaine démarre au retrait d\'octobre', () => {
    expect(periodStart('weekly', { now: nov1, withdrawals })).toBe('2026-10-29');
  });

  it('octobre clôturé → plus rien d\'octobre n\'est décompté', () => {
    expect(periodStart('weekly', { now: nov1, withdrawals, savingsHistory: closedOct })).toBe('2026-11-01');
    expect(isCutByClosure('weekly', { now: nov1, withdrawals, savingsHistory: closedOct })).toBe(true);
    // la fin de semaine reste calée sur le cycle du retrait
    expect(periodEnd('weekly', { now: nov1, withdrawals })).toBe('2026-11-04');
  });

  it('un mois non clôturé n\'a aucun effet', () => {
    expect(periodStart('weekly', { now: nov1, withdrawals, savingsHistory: [{ month: '2026-10' }] })).toBe('2026-10-29');
  });

  it('épargne versée fin octobre non décomptée en novembre', () => {
    const since = periodStart('weekly', { now: nov1, withdrawals, savingsHistory: closedOct });
    const txs = [{ envelopeId: 's', amount: 234, date: '2026-10-31' }];
    expect(spentInPeriod(txs, 's', 'weekly', { since })).toBe(0);
  });
});

describe('mois de fin des charges fixes', () => {
  const credit = { amount: 250, endMonth: '2026-11' };
  it('compte jusqu\'au mois de fin inclus', () => {
    expect(totalFixed([credit, { amount: 700 }], '2026-11')).toBe(950);
    expect(totalFixed([credit, { amount: 700 }], '2026-12')).toBe(700);
  });
  it('mois restants', () => {
    expect(monthsLeft(credit, '2026-10')).toBe(2);
    expect(monthsLeft(credit, '2026-11')).toBe(1);
    expect(monthsLeft(credit, '2027-01')).toBe(0);
    expect(monthsLeft({ amount: 1 }, '2026-10')).toBeNull();
  });
});

describe('retraits DAB détectés sur le relevé', () => {
  it('ni « à classer » ni compté comme dépense carte', async () => {
    const { isBankTodo } = await import('./budget');
    const dab = { date: '2026-11-02', amount: -60, isCard: true, label: 'RETRAIT CB 0211', withdrawalId: 'w1', envelopeId: null, ignored: false };
    expect(isBankTodo(dab)).toBe(false);
    expect(isBankTodo({ ...dab, withdrawalId: null })).toBe(true);
    const r = realSpending({ since: '2026-11-01', envelopes: [], transactions: [], bankTransactions: [dab] });
    expect(r.total).toBe(0);
  });
});

describe('budget idéal et reports', async () => {
  const { idealSplit, carryoverFor } = await import('./budget');
  it('répartition par défaut et personnalisée', () => {
    expect(idealSplit({})).toEqual({ needs: 0.5, wants: 0.3, savings: 0.2 });
    expect(idealSplit({ idealNeedsPct: 60, idealWantsPct: 20, idealSavingsPct: 20 })).toEqual({ needs: 0.6, wants: 0.2, savings: 0.2 });
  });
  it('report d\'une enveloppe pour un mois', () => {
    const c = [{ envelopeId: 'a', month: '2026-11', amount: 35 }, { envelopeId: 'a', month: '2026-12', amount: 10 }];
    expect(carryoverFor(c, 'a', '2026-11')).toBe(35);
    expect(carryoverFor(c, 'b', '2026-11')).toBe(0);
  });
});
