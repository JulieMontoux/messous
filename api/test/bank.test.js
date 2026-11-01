const { test, after } = require('node:test');
const assert = require('node:assert');
const { pool, newUser, csvBody, day, iso, fr } = require('./helpers');

after(() => pool.end());

const today = day(0);
const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, 3);
const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, 15);

async function envelope(u, name = 'Courses', budget = 300) {
  return (await u.post('/api/envelopes', { name, categoryId: 'groceries', type: 'need', budgetMonthly: budget })).body;
}

test('import CSV : seulement depuis le 1er du mois dernier, sans doublon', async () => {
  const u = await newUser();
  const lines = [
    `${fr(twoMonthsAgo)};CB VIEUX 0101;-10,00`,
    `${fr(monthAgo)};CB LIDL 0301;-20,00`,
    `${fr(today)};CB LIDL 0302;-5,50`,
  ];
  const r1 = (await u.post('/api/bank/import', csvBody(lines)).expect(200)).body;
  assert.equal(r1.parsed, 3);
  assert.equal(r1.skipped, 1);
  assert.equal(r1.inserted, 2);
  const r2 = (await u.post('/api/bank/import', csvBody(lines)).expect(200)).body;
  assert.equal(r2.inserted, 0);
});

test('classement en masse + règle marchand appliquée aux nouvelles opérations', async () => {
  const u = await newUser();
  const env = await envelope(u);
  await u.post('/api/bank/import', csvBody([`${fr(monthAgo)};CB LIDL 0301;-20,00`, `${fr(today)};CB LIDL 0302;-5,50`]));
  const txs = (await u.get('/api/bank/transactions')).body;
  const r = (await u.post('/api/bank/transactions/bulk', { ids: txs.map(t => t.id), envelopeId: env.id, remember: true }).expect(200)).body;
  assert.equal(r.updated, 2);
  assert.equal((await u.get('/api/transactions')).body.length, 2);

  const r2 = (await u.post('/api/bank/import', csvBody([`${fr(today)};CB LIDL 0999;-7,00`])).expect(200)).body;
  assert.equal(r2.assigned, 1);
});

test('retrait DAB détecté et rattaché à un retrait saisi à la main', async () => {
  const u = await newUser();
  await u.post('/api/withdrawals', { date: iso(today), amount: 80 }).expect(200);
  const r = (await u.post('/api/bank/import', csvBody([
    `${fr(today)};RETRAIT DAB PARIS 11;-80,00`,
    `${fr(today)};CARTE X1234 RETRAIT DAB SG;-40,00`,
    `${fr(today)};CB CARREFOUR;-15,00`,
  ])).expect(200)).body;
  assert.equal(r.withdrawals, 2);
  const withdrawals = (await u.get('/api/withdrawals')).body;
  assert.equal(withdrawals.length, 2, 'le retrait de 80 € ne doit pas être dupliqué');
  assert.ok(withdrawals.every(w => w.bankTransactionId));
  const bank = (await u.get('/api/bank/transactions')).body;
  assert.equal(bank.find(b => b.label.includes('CARREFOUR')).withdrawalId, null);
});

test('charge fixe annuelle : paiement rattaché → « payé le »', async () => {
  const u = await newUser();
  const charge = (await u.post('/api/charges', { name: 'Assurance', amount: 120, frequency: 'yearly', dueMonth: today.getMonth() + 1 })).body;
  await u.post('/api/bank/import', csvBody([`${fr(today)};PRLV SEPA ASSUREUR;-120,00`]));
  const [btx] = (await u.get('/api/bank/transactions')).body;
  await u.post(`/api/bank/transactions/${btx.id}/assign`, { fixedChargeId: charge.id }).expect(200);
  const c = (await u.get('/api/charges')).body.find(x => x.id === charge.id);
  assert.equal(c.lastPaidAt, iso(today));
  assert.equal(c.frequency, 'yearly');
});

test('pas d\'e-mail d\'alerte pour une dépense du mois précédent', async () => {
  const { isInCurrentMonth } = require('../src/lib/alerts');
  assert.equal(isInCurrentMonth(iso(monthAgo)), false);
  assert.equal(isInCurrentMonth(iso(today)), true);
  assert.equal(isInCurrentMonth(iso(day(40))), false);
});

test('rappel e-mail 7 jours avant l\'expiration de la connexion bancaire, puis expiration', async () => {
  const { bankExpiryReminders } = require('../src/lib/scheduler');
  const u = await newUser();
  const { rows: [me] } = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
  const inFiveDays = new Date(Date.now() + 5 * 86400000);
  const { rows: [conn] } = await pool.query(
    "INSERT INTO bank_connections (user_id, provider, bank_name, status, valid_until) VALUES ($1, 'enablebanking', 'Ma Banque', 'active', $2) RETURNING id",
    [me.id, inFiveDays]
  );
  // SMTP absent en test : l'e-mail n'est pas envoyé, mais la tentative est journalisée puis annulée
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try { await bankExpiryReminders(); } finally { console.log = orig; }
  assert.ok(logs.some(l => l.includes('expire dans 5 jours')), logs.join('\n'));

  await bankExpiryReminders(new Date(Date.now() + 6 * 86400000));
  const { rows: [after] } = await pool.query('SELECT status FROM bank_connections WHERE id = $1', [conn.id]);
  assert.equal(after.status, 'expired');
});
