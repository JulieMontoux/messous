const { test, after } = require('node:test');
const assert = require('node:assert');
const { pool, setup, newUser, csvBody, captureMails, userId, day, iso, fr } = require('./helpers');
const { monthKey } = require('../src/lib/dates');

after(() => pool.end());

test('les migrations peuvent être rejouées sans erreur (redémarrages)', async () => {
  await setup();
  const { migrate } = require('../src/db');
  await migrate();
  await migrate();
});

test('clôture : le reste versé sur un objectif est corrigé si on modifie la clôture', async () => {
  const u = await newUser();
  const goal = (await u.post('/api/goals', { name: 'Voyage', targetAmount: 2000, currentAmount: 100 })).body;
  await u.put('/api/savings/2026-09/close', { actualSavings: 200, actualRemainder: 50, remainderToGoalId: goal.id }).expect(200);
  assert.equal((await u.get('/api/goals')).body[0].currentAmount, 150);
  await u.put('/api/savings/2026-09/close', { actualSavings: 200, actualRemainder: 80, remainderToGoalId: goal.id }).expect(200);
  assert.equal((await u.get('/api/goals')).body[0].currentAmount, 180, 'pas de double comptage');
  await u.put('/api/savings/2026-09/close', { actualSavings: 200, actualRemainder: 80, remainderToGoalId: null }).expect(200);
  assert.equal((await u.get('/api/goals')).body[0].currentAmount, 100, 'versement annulé');
  await u.put('/api/savings/2026-13/close', { actualSavings: 1 }).expect(400);
});

test('la photo du mois (salaire, charges) ne touche pas la clôture déjà saisie', async () => {
  const u = await newUser();
  await u.put('/api/savings/2026-10/close', { actualSavings: 300, actualRemainder: 20 }).expect(200);
  await u.put('/api/savings/2026-10', { salary: 2500, totalFixed: 900, totalEnvelopes: 700, programmedSavings: 0, savingEnvelopes: 100, remainder: 800, totalSavings: 900, recordedAt: new Date().toISOString() }).expect(200);
  const [snap] = (await u.get('/api/savings')).body;
  assert.equal(snap.salary, 2500);
  assert.equal(snap.actualSavings, 300);
  assert.ok(snap.closedAt);
});

test('dépense récurrente créée une seule fois par mois', async () => {
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'Abos', categoryId: 'leisure', type: 'want', budgetMonthly: 50 })).body;
  await u.post('/api/recurring', { envelopeId: env.id, amount: 9.99, note: 'Musique', dayOfMonth: 1 }).expect(200);
  await u.get('/api/transactions').expect(200);
  const txs = (await u.get('/api/transactions').expect(200)).body;
  assert.equal(txs.length, 1);
  assert.equal(txs[0].date, `${monthKey()}-01`);
  assert.equal(txs[0].note, '↩ Musique');
});

test('supprimer une dépense issue de la banque remet l\'opération « à classer »', async () => {
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'Courses', categoryId: 'groceries', type: 'need', budgetMonthly: 300 })).body;
  await u.post('/api/bank/import', csvBody([`${fr(day(0))};CB LIDL;-25,00`]));
  const [btx] = (await u.get('/api/bank/transactions')).body;
  const { transaction } = (await u.post(`/api/bank/transactions/${btx.id}/assign`, { envelopeId: env.id })).body;
  await u.del(`/api/transactions/${transaction.id}`).expect(200);
  const after = (await u.get('/api/bank/transactions')).body[0];
  assert.equal(after.envelopeId, null);
  assert.equal(after.transactionId, null);
});

test('supprimer une enveloppe : ses dépenses partent, l\'opération bancaire redevient à classer', async () => {
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'Courses', categoryId: 'groceries', type: 'need', budgetMonthly: 300 })).body;
  await u.post('/api/bank/import', csvBody([`${fr(day(0))};CB LIDL;-25,00`]));
  const [btx] = (await u.get('/api/bank/transactions')).body;
  await u.post(`/api/bank/transactions/${btx.id}/assign`, { envelopeId: env.id, remember: true });
  await u.del(`/api/envelopes/${env.id}`).expect(200);
  assert.equal((await u.get('/api/transactions')).body.length, 0);
  assert.equal((await u.get('/api/bank/transactions')).body[0].envelopeId, null);
  assert.equal((await u.get('/api/bank/status')).body.rules.length, 0, 'règle supprimée avec l\'enveloppe');
});

test('réinitialisation : toutes les tables de l\'utilisateur sont vidées', async () => {
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'X', categoryId: 'other', type: 'need', budgetMonthly: 10 })).body;
  await u.post('/api/advances', { person: 'A', amount: 5 });
  await u.post('/api/bank/import', csvBody([`${fr(day(0))};RETRAIT DAB;-20,00`]));
  await u.put(`/api/savings/${monthKey()}/close`, { actualSavings: 1, carryovers: [{ envelopeId: env.id, amount: 5 }] });
  await u.post('/api/push/subscribe', { subscription: { endpoint: `https://push.example.com/${Date.now()}`, keys: { p256dh: 'x', auth: 'y' } } });
  await u.post('/api/profile/reset', { password: u.password }).expect(200);

  const id = await userId(u);
  for (const table of ['envelopes', 'transactions', 'advances', 'bank_transactions', 'bank_accounts', 'withdrawals',
    'savings_history', 'envelope_carryovers', 'push_subscriptions', 'fixed_charges', 'savings_goals']) {
    const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE user_id = $1`, [id]);
    assert.equal(n, 0, `${table} non vidée`);
  }
});

test('rappel de fin de mois : seulement le dernier jour, après l\'heure prévue, une fois, pas si déjà clôturé', async () => {
  const { monthEndReminders } = require('../src/lib/scheduler');
  const u = await newUser();
  await u.put('/api/profile', { onboardingDone: true }).expect(200);
  const lastDay = new Date(2031, 0, 31, 19, 0);
  const mine = logs => logs.filter(l => l.includes(u.email));

  assert.equal(mine(await captureMails(() => monthEndReminders(new Date(2031, 0, 30, 19, 0)))).length, 0, 'avant-dernier jour');
  assert.equal(mine(await captureMails(() => monthEndReminders(new Date(2031, 0, 31, 9, 0)))).length, 0, 'trop tôt');
  assert.equal(mine(await captureMails(() => monthEndReminders(lastDay))).length, 1);

  await u.put('/api/savings/2031-01/close', { actualSavings: 10 }).expect(200);
  assert.equal(mine(await captureMails(() => monthEndReminders(lastDay))).length, 0, 'mois déjà clôturé');

  await u.put('/api/profile', { monthEndEmail: false }).expect(200);
  assert.equal(mine(await captureMails(() => monthEndReminders(new Date(2031, 1, 28, 20, 0)))).length, 0, 'désactivé');
});

test('bilan mensuel : seulement le 1er du mois, à partir de 9 h', async () => {
  const { monthlyReports } = require('../src/lib/scheduler');
  const u = await newUser();
  await u.put('/api/profile', { onboardingDone: true }).expect(200);
  const mine = logs => logs.filter(l => l.includes(u.email));
  assert.equal(mine(await captureMails(() => monthlyReports(new Date(2031, 2, 2, 10, 0)))).length, 0);
  assert.equal(mine(await captureMails(() => monthlyReports(new Date(2031, 2, 1, 7, 0)))).length, 0);
  const logs = mine(await captureMails(() => monthlyReports(new Date(2031, 2, 1, 10, 0))));
  assert.equal(logs.length, 1);
  assert.match(logs[0], /février 2031/);
});

test('profil : thème invalide ramené à « auto », champs inconnus ignorés', async () => {
  const u = await newUser();
  const p = (await u.put('/api/profile', { theme: 'fluo', hacker: true, firstName: 'Julie' }).expect(200)).body;
  assert.equal(p.theme, 'auto');
  assert.equal(p.firstName, 'Julie');
  assert.equal(p.hacker, undefined);
});

test('retraits : montant ou date manquants refusés', async () => {
  const u = await newUser();
  await u.post('/api/withdrawals', { amount: 50 }).expect(400);
  await u.post('/api/withdrawals', { date: iso(day(0)), amount: 0 }).expect(400);
});

test('mois invalides refusés partout', async () => {
  const u = await newUser();
  for (const m of ['2026-13', '2026-00', '26-01', 'abc']) {
    await u.put(`/api/savings/${m}`, { salary: 1 }).expect(400);
    await u.put(`/api/savings/${m}/close`, { actualSavings: 1 }).expect(400);
    await u.get(`/api/savings/${m}/report`).expect(400);
  }
});
