import { describe, it, expect } from 'vitest';
import { weekStart, periodStart, periodEnd, mondayOf, lastWithdrawal, isLastDayOfMonth, addDays } from './period';
import { spentInPeriod, envelopeForecast, realSpending } from './budget';

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
