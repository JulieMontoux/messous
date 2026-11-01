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
