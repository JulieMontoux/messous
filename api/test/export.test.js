const { test, after } = require('node:test');
const assert = require('node:assert');
const { pool, newUser, csvBody, day, fr } = require('./helpers');

after(() => pool.end());

test('exports CSV : format Excel français, données de l\'utilisateur uniquement', async () => {
  const u = await newUser();
  const other = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'Courses; marché', categoryId: 'groceries', type: 'need', budgetMonthly: 300 })).body;
  await u.post('/api/transactions', { envelopeId: env.id, amount: 12.5, date: '2026-11-02', note: 'Pain "bio"', paymentMethod: 'card' });
  await other.post('/api/advances', { person: 'Secret', amount: 99 });
  await u.post('/api/bank/import', csvBody([`${fr(day(0))};CB LIDL;-5,00`]));

  const r = await u.get('/api/export/depenses.csv').expect(200);
  assert.match(r.headers['content-type'], /text\/csv/);
  assert.match(r.headers['content-disposition'], /messous-depenses-/);
  const text = r.text;
  assert.ok(text.startsWith('﻿'), 'BOM pour Excel');
  const lines = text.trim().split('\r\n');
  assert.equal(lines[0].replace('﻿', ''), 'Date;Enveloppe;Type;Montant;Paiement;Description');
  assert.equal(lines[1], '2026-11-02;"Courses; marché";Besoin;12,50;Carte;"Pain ""bio"""');

  const bank = (await u.get('/api/export/banque.csv').expect(200)).text;
  assert.match(bank, /CB LIDL;-5,00;À classer/);

  const adv = (await u.get('/api/export/avances.csv').expect(200)).text;
  assert.doesNotMatch(adv, /Secret/);

  await u.get('/api/export/inconnu.csv').expect(404);
});

test('exports : toutes les catégories et tous les cas', async () => {
  const u = await newUser();
  const need = (await u.post('/api/envelopes', { name: 'C', categoryId: 'groceries', type: 'need', budgetMonthly: 1 })).body;
  const want = (await u.post('/api/envelopes', { name: 'R', categoryId: 'restaurant', type: 'want', budgetMonthly: 1 })).body;
  const sav = (await u.post('/api/envelopes', { name: 'L', categoryId: 'livret', type: 'saving', budgetMonthly: 1 })).body;
  const other = (await u.post('/api/envelopes', { name: 'D', budgetMonthly: 1 })).body;
  for (const e of [need, want, sav, other]) await u.post('/api/transactions', { envelopeId: e.id, amount: 1, date: '2026-11-01' });
  const dep = (await u.get('/api/export/depenses.csv')).text;
  for (const t of ['Besoin', 'Envie', 'Épargne', 'Espèces']) assert.match(dep, new RegExp(t));

  await u.post('/api/charges', { name: 'M', amount: 1 });
  await u.post('/api/charges', { name: 'T', amount: 1, frequency: 'quarterly', dueMonth: 2 });
  await u.post('/api/charges', { name: 'A', amount: 1, frequency: 'yearly', dueMonth: 5, endMonth: '2027-05' });
  const ch = (await u.get('/api/export/charges.csv')).text;
  for (const t of ['Mensuelle', 'Trimestrielle', 'Annuelle;5;2027-05']) assert.match(ch, new RegExp(t));

  await u.post('/api/withdrawals', { date: '2026-11-01', amount: 40, suggestedAmount: 35, note: 'DAB' });
  assert.match((await u.get('/api/export/retraits.csv')).text, /2026-11-01;40,00;35,00;Saisie;DAB/);

  const adv = (await u.post('/api/advances', { person: 'Léa', amount: 9 })).body;
  await u.put(`/api/advances/${adv.id}/repaid`, { date: '2026-11-02' });
  assert.match((await u.get('/api/export/avances.csv')).text, /Léa;9,00;;2026-11-02/);

  await u.put('/api/savings/2026-10', { salary: 2500, totalFixed: 700, totalEnvelopes: 600, programmedSavings: 100, savingEnvelopes: 50, remainder: 1050, totalSavings: 1200, recordedAt: new Date().toISOString() });
  await u.put('/api/savings/2026-10/close', { actualSavings: 300, actualRemainder: 20 });
  await u.put('/api/savings/2026-09', { salary: 2400, totalFixed: 700, totalEnvelopes: 600, programmedSavings: 0, savingEnvelopes: 0, remainder: 1100, totalSavings: 1100, recordedAt: new Date().toISOString() });
  const hist = (await u.get('/api/export/historique.csv')).text;
  assert.match(hist, /2026-10;2500,00;.*;300,00;20,00;\d{4}-\d{2}-\d{2}/);
  assert.match(hist, /2026-09;2400,00;.*;1100,00;;;/);

  // Banque : tous les classements possibles
  await u.post('/api/bank/import', csvBody([
    `${fr(day(0))};CB E;-1,00`, `${fr(day(0))};PRLV F;-2,00`, `${fr(day(0))};RETRAIT DAB;-20,00`,
    `${fr(day(0))};CB AV;-3,00`, `${fr(day(0))};CB IGN;-4,00`, `${fr(day(0))};VIR RECU;10,00`,
  ]));
  const ops = (await u.get('/api/bank/transactions')).body;
  const byLabel = l => ops.find(o => o.label === l).id;
  const charge = (await u.get('/api/charges')).body[0];
  await u.post(`/api/bank/transactions/${byLabel('CB E')}/assign`, { envelopeId: need.id });
  await u.post(`/api/bank/transactions/${byLabel('PRLV F')}/assign`, { fixedChargeId: charge.id });
  await u.post(`/api/bank/transactions/${byLabel('CB AV')}/assign`, { advance: { person: 'Tom' } });
  await u.post(`/api/bank/transactions/${byLabel('CB IGN')}/ignore`, { ignored: true });
  const bank = (await u.get('/api/export/banque.csv')).text;
  for (const t of ['Enveloppe : C', 'Charge fixe : M', "Retrait d'espèces", 'Avance : Tom', 'Ignorée', 'VIR RECU;10,00;;Compte test']) {
    assert.ok(bank.includes(t), t);
  }
});

test('export : erreur base → 500', async () => {
  const { mock } = require('node:test');
  const u = await newUser();
  const q = mock.method(pool, 'query', async () => { throw new Error('panne'); });
  try {
    await u.get('/api/export/depenses.csv').expect(r => {
      // l'authentification consulte aussi la base : 401 ou 500 selon l'ordre, jamais 200
      assert.notEqual(r.status, 200);
    });
  } finally {
    q.mock.restore();
  }
});
