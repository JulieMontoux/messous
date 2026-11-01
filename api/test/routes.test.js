const { test, after } = require('node:test');
const assert = require('node:assert');
const { app, request, pool, newUser, day, iso } = require('./helpers');

after(() => pool.end());

const BAD = 'pas-un-uuid';

test('erreurs base de données → 500 avec message (identifiant invalide)', async () => {
  const u = await newUser();
  await u.put(`/api/charges/${BAD}`, { name: 'x', amount: 1 }).expect(500);
  await u.put(`/api/envelopes/${BAD}`, { name: 'x', budgetMonthly: 1 }).expect(500);
  await u.put(`/api/goals/${BAD}`, { name: 'x', targetAmount: 1, currentAmount: 0 }).expect(500);
  await u.patch(`/api/goals/${BAD}/deposit`, { amount: 1 }).expect(500);
  await u.del(`/api/goals/${BAD}`).expect(500);
  await u.put(`/api/advances/${BAD}/repaid`, { repaid: true }).expect(500);
  await u.del(`/api/advances/${BAD}`).expect(500);
  await u.put(`/api/recurring/${BAD}`, { amount: 1 }).expect(500);
  await u.del(`/api/recurring/${BAD}`).expect(500);
  await u.post(`/api/bank/transactions/${BAD}/unassign`).expect(500);
  await u.post(`/api/bank/transactions/${BAD}/ignore`, { ignored: true }).expect(500);
  await u.del(`/api/bank/rules/${BAD}`).expect(500);
  await u.del(`/api/bank/connections/${BAD}`).expect(500);
  await u.post('/api/charges', { name: null, amount: 1 }).expect(500);
  await u.post('/api/envelopes', { name: null }).expect(500);
  await u.post('/api/goals', { name: null }).expect(500);
  await u.post('/api/recurring', { envelopeId: BAD, amount: 1 }).expect(500);
  await u.post('/api/transactions', { envelopeId: '00000000-0000-0000-0000-000000000000', amount: 1, date: '2026-11-01' }).expect(500);
  await u.post('/api/withdrawals', { date: 'pas-une-date', amount: 5 }).expect(500);
  await u.post('/api/advances', { person: 'A', amount: 5, date: 'pas-une-date' }).expect(500);
  await u.put('/api/savings/2026-10/close', { remainderToGoalId: BAD, actualRemainder: 5 }).expect(500);
  await u.put('/api/savings/2026-10', { salary: 'abc' }).expect(500);
  await u.put('/api/profile', { netSalary: 'abc' }).expect(500);
  await u.put('/api/profile/salary', { amount: 'abc' }).expect(400);
});

test('identifiants non-UUID ignorés sans erreur sur les suppressions « anciennes données »', async () => {
  const u = await newUser();
  await u.del('/api/charges/ancien-id').expect(200);
  await u.del('/api/envelopes/ancien-id').expect(200);
  await u.del('/api/transactions/ancien-id').expect(200);
  await u.del('/api/withdrawals/ancien-id').expect(200);
  const skipped = (await u.post('/api/transactions', { envelopeId: 'ancien-format', amount: 3 }).expect(200)).body;
  assert.equal(skipped.skipped, true);
});

test('valeurs par défaut et champs optionnels', async () => {
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { id: 'ancien', name: 'Divers', budgetMonthly: 10 })).body;
  assert.equal(env.type, null);
  const tx = (await u.post('/api/transactions', { envelopeId: env.id, amount: 4 })).body;
  assert.equal(tx.date, iso(day(0)), 'date du jour par défaut');
  assert.equal(tx.paymentMethod, 'cash');
  assert.equal(tx.note, '');
  const w = (await u.post('/api/withdrawals', { date: iso(day(0)), amount: 20 })).body;
  assert.deepEqual([w.suggestedAmount, w.mode, w.note, w.source], [null, 'weekly', '', 'manual']);
  const g = (await u.post('/api/goals', { name: 'Fonds', targetAmount: 500 })).body;
  assert.deepEqual([g.currentAmount, g.targetDate, g.icon, g.monthlyContribution], [0, null, '🎯', null]);
  const g2 = (await u.put(`/api/goals/${g.id}`, { name: 'Fonds', targetAmount: 600, currentAmount: 10, targetDate: '2027-06-01', icon: '💰', monthlyContribution: 50 })).body;
  assert.equal(g2.targetDate, '2027-06-01');
  await u.patch(`/api/goals/${g.id}/deposit`, { amount: 0 }).expect(400);
  await u.patch('/api/goals/00000000-0000-0000-0000-000000000000/deposit', { amount: 5 }).expect(404);
  const c = (await u.post('/api/charges', { name: 'Box', amount: 30, frequency: 'n-importe', dueMonth: 99, endMonth: 'demain' })).body;
  assert.deepEqual([c.frequency, c.dueMonth, c.endMonth], ['monthly', null, null]);
  const c2 = (await u.put(`/api/charges/${c.id}`, { name: 'Box', amount: 90, frequency: 'quarterly', dueMonth: 0 })).body;
  assert.deepEqual([c2.frequency, c2.dueMonth], ['quarterly', null]);
  const c3 = (await u.put(`/api/charges/${c.id}`, { name: 'Box', amount: 90, frequency: 'yearly', dueMonth: 15 })).body;
  assert.equal(c3.dueMonth, 12);
  await u.put('/api/charges/00000000-0000-0000-0000-000000000000', { name: 'x', amount: 1 }).expect(404);
  await u.put('/api/envelopes/00000000-0000-0000-0000-000000000000', { name: 'x', budgetMonthly: 1 }).expect(404);
  await u.put('/api/goals/00000000-0000-0000-0000-000000000000', { name: 'x', targetAmount: 1, currentAmount: 0 }).expect(404);
  await u.put('/api/advances/00000000-0000-0000-0000-000000000000/repaid', {}).expect(404);
});

test('récurrences : liste, modification, désactivation, suppression', async () => {
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'Abos', categoryId: 'leisure', type: 'want', budgetMonthly: 30 })).body;
  const r = (await u.post('/api/recurring', { envelopeId: env.id, amount: 5 }).expect(200)).body;
  assert.deepEqual([r.note, r.dayOfMonth, r.active], ['', 1, true]);
  const r2 = (await u.put(`/api/recurring/${r.id}`, { envelopeId: env.id, amount: 6, note: 'Cloud', dayOfMonth: 28, active: false }).expect(200)).body;
  assert.deepEqual([r2.amount, r2.dayOfMonth, r2.active], [6, 28, false]);
  assert.equal((await u.get('/api/recurring').expect(200)).body.length, 1);
  await u.put('/api/recurring/00000000-0000-0000-0000-000000000000', { amount: 1, active: true }).expect(404);
  await u.del(`/api/recurring/${r.id}`).expect(200);
  assert.equal((await u.get('/api/recurring')).body.length, 0);
  // Une récurrence sans note crée « ↩ Récurrent »
  await u.post('/api/recurring', { envelopeId: env.id, amount: 2, dayOfMonth: 1 });
  assert.equal((await u.get('/api/transactions')).body[0].note, '↩ Récurrent');
});

test('réglages : mode d\'affichage', async () => {
  const u = await newUser();
  assert.equal((await u.get('/api/settings').expect(200)).body.view_mode, 'monthly');
  assert.equal((await u.put('/api/settings', { viewMode: 'weekly' }).expect(200)).body.view_mode, 'weekly');
});

test('inscription et connexion : validations', async () => {
  await request(app).post('/api/auth/register').send({ email: 'a@b.fr', password: '123' }).expect(400);
  await request(app).post('/api/auth/register').send({}).expect(400);
  const u = await newUser();
  assert.match((await request(app).post('/api/auth/register').send({ email: u.email.toUpperCase(), password: 'motdepasse1' }).expect(409)).body.error, /déjà utilisé/);
  await request(app).post('/api/auth/login').send({ email: u.email }).expect(400);
  await request(app).post('/api/auth/login').send({ email: ` ${u.email.toUpperCase()} `, password: u.password }).expect(200);
});

test('avances : validations et annulation d\'un remboursement', async () => {
  const u = await newUser();
  await u.post('/api/advances', { amount: 5 }).expect(400);
  await u.post('/api/advances', { person: 'A', amount: 0 }).expect(400);
  const a = (await u.post('/api/advances', { person: '  Léa  ', amount: 12, note: 'Ciné', date: '2026-10-02' })).body;
  assert.equal(a.person, 'Léa');
  const paid = (await u.put(`/api/advances/${a.id}/repaid`, { date: '2026-10-05' })).body;
  assert.equal(paid.repaidAt, '2026-10-05');
  const unpaid = (await u.put(`/api/advances/${a.id}/repaid`, { repaid: false })).body;
  assert.equal(unpaid.repaidAt, null);
});

test('profil : solde manuel, salaire programmé annulé, champs vidés, e-mail de test sans SMTP', async () => {
  const u = await newUser();
  const p1 = (await u.put('/api/profile/balance', { balance: 1234.5 }).expect(200)).body;
  assert.equal(p1.manualBalance, 1234.5);
  assert.ok(p1.manualBalanceAt);
  const p2 = (await u.put('/api/profile/balance', { balance: '' }).expect(200)).body;
  assert.equal(p2.manualBalance, null);
  await u.put('/api/profile/balance', { balance: 'abc' }).expect(400);

  await u.put('/api/profile/salary', { amount: 3000, from: '2099-01' }).expect(200);
  await u.put('/api/profile/salary', { amount: 3000, from: '2099-1' }).expect(400);
  await u.del('/api/profile/salary/pending').expect(200);
  assert.equal((await u.get('/api/profile')).body.nextSalary, null);

  const p3 = (await u.put('/api/profile', { alertEmail: 'a@b.fr', pets: { dogs: 1, cats: 0, other: 0 }, tobaccoQuitDate: '2026-10-01' })).body;
  assert.deepEqual([p3.alertEmail, p3.pets.dogs, p3.tobaccoQuitDate], ['a@b.fr', 1, '2026-10-01']);
  const p4 = (await u.put('/api/profile', { alertEmail: '', tobaccoQuitDate: '' })).body;
  assert.deepEqual([p4.alertEmail, p4.tobaccoQuitDate], ['', null]);
  assert.deepEqual((await u.put('/api/profile', {}).expect(200)).body.firstName, '');

  const saved = process.env.SMTP_HOST;
  delete process.env.SMTP_HOST;
  await u.post('/api/profile/test-email').expect(400);
  if (saved) process.env.SMTP_HOST = saved;
  await u.post('/api/profile/reset', {}).expect(403);
});

test('push : abonnement invalide refusé, désabonnement', async () => {
  const u = await newUser();
  await u.post('/api/push/subscribe', {}).expect(400);
  await u.post('/api/push/subscribe', { subscription: { endpoint: 'https://x' } }).expect(400);
  const sub = { endpoint: `https://push.example.com/${Date.now()}`, keys: { p256dh: 'a', auth: 'b' } };
  await u.post('/api/push/subscribe', { subscription: sub }).expect(200);
  await u.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).expect(200);
  const { rows } = await pool.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
  assert.equal(rows.length, 0);
});

test('banque : classement en masse — validations, ignorer, retrait, charge fixe', async () => {
  const { csvBody, fr } = require('./helpers');
  const u = await newUser();
  await u.post('/api/bank/transactions/bulk', { ids: [] }).expect(400);
  await u.post('/api/bank/transactions/bulk', { ids: ['00000000-0000-0000-0000-000000000000'] }).expect(400);
  await u.post('/api/bank/transactions/bulk', { ids: ['00000000-0000-0000-0000-000000000000'], envelopeId: '00000000-0000-0000-0000-000000000000' }).expect(400);
  await u.post('/api/bank/transactions/bulk', { ids: ['00000000-0000-0000-0000-000000000000'], fixedChargeId: '00000000-0000-0000-0000-000000000000' }).expect(400);
  await u.post('/api/bank/import', csvBody([`${fr(day(0))};CB A;-1,00`, `${fr(day(0))};CB B;-2,00`, `${fr(day(0))};PRLV EDF;-50,00`]));
  const [a, b, edf] = (await u.get('/api/bank/transactions')).body.sort((x, y) => x.amount - y.amount).reverse();
  const charge = (await u.post('/api/charges', { name: 'EDF', amount: 50, categoryId: 'energy' })).body;
  await u.post('/api/bank/transactions/bulk', { ids: [edf.id], fixedChargeId: charge.id, remember: true }).expect(200);
  await u.post('/api/bank/transactions/bulk', { ids: [a.id], asWithdrawal: true }).expect(200);
  await u.post('/api/bank/transactions/bulk', { ids: [b.id, a.id], ignore: true }).expect(200);
  const after = (await u.get('/api/bank/transactions')).body;
  assert.equal(after.find(x => x.id === edf.id).fixedChargeId, charge.id);
  assert.ok(after.find(x => x.id === a.id).ignored);
  assert.equal(after.find(x => x.id === a.id).withdrawalId, null, 'ignorer supprime le retrait');
  const rules = (await u.get('/api/bank/status')).body.rules;
  assert.equal(rules[0].fixedChargeId, charge.id);
  await u.del(`/api/bank/rules/${rules[0].id}`).expect(200);
  await u.post(`/api/bank/transactions/${a.id}/ignore`, { ignored: false }).expect(200);
  await u.post('/api/bank/transactions/00000000-0000-0000-0000-000000000000/unassign').expect(404);
  await u.post(`/api/bank/transactions/${a.id}/assign`, { fixedChargeId: '00000000-0000-0000-0000-000000000000' }).expect(400);
  await u.post('/api/bank/transactions/00000000-0000-0000-0000-000000000000/assign', { asWithdrawal: true }).expect(404);
  await u.post('/api/bank/transactions/00000000-0000-0000-0000-000000000000/assign', { advance: { person: 'X' } }).expect(404);
  await u.post(`/api/bank/transactions/${a.id}/assign`, { advance: {} }).expect(400);
  await u.post('/api/bank/import', { csv: '' }).expect(400);
  // Transactions filtrées par date
  assert.equal((await u.get('/api/bank/transactions?from=2099-01-01')).body.length, 0);
  // Suggestions limitées à une sélection
  assert.equal(Object.keys((await u.post('/api/bank/suggest', { ids: [b.id], useAi: false }).expect(200)).body.suggestions).length, 0);
});

test('réglages : ligne absente (ancien compte) → valeur par défaut, puis créée', async () => {
  const { userId } = require('./helpers');
  const u = await newUser();
  await pool.query('DELETE FROM settings WHERE user_id = $1', [await userId(u)]);
  assert.deepEqual((await u.get('/api/settings').expect(200)).body, { viewMode: 'monthly' });
  assert.equal((await u.put('/api/settings', { viewMode: 'weekly' }).expect(200)).body.view_mode, 'weekly');
  assert.equal((await u.put('/api/settings', { viewMode: 'n-importe' }).expect(200)).body.view_mode, 'monthly');
});

test('profil : valeurs absentes en base → valeurs par défaut ; profil manquant → objet vide', async () => {
  const { userId } = require('./helpers');
  const u = await newUser();
  const id = await userId(u);
  await pool.query(`UPDATE profiles SET first_name = NULL, net_salary = NULL, has_car = NULL, is_smoker = NULL,
    household_adults = NULL, household_children = NULL, pets = NULL, region = NULL, supermarket = NULL,
    onboarding_done = NULL, tobacco_type = NULL, tobacco_pack_price = NULL, tobacco_packs_per_week = NULL,
    alerts_enabled = NULL, alert_threshold = NULL, month_end_email = NULL, round_withdrawals = NULL,
    ideal_needs_pct = NULL, ideal_wants_pct = NULL, ideal_savings_pct = NULL, monthly_report_email = NULL, theme = NULL
    WHERE user_id = $1`, [id]);
  const p = (await u.get('/api/profile').expect(200)).body;
  assert.deepEqual(
    [p.firstName, p.netSalary, p.hasCar, p.isSmoker, p.householdAdults, p.householdChildren, p.pets.dogs, p.region, p.supermarket,
      p.onboardingDone, p.tobaccoType, p.tobaccoPackPrice, p.tobaccoPacksPerWeek, p.alertsEnabled, p.alertThreshold,
      p.monthEndEmail, p.roundWithdrawals, p.idealNeedsPct, p.idealWantsPct, p.idealSavingsPct, p.monthlyReportEmail, p.theme],
    ['', 0, true, false, 1, 0, 0, 'Île-de-France', 'leclerc', false, 'indus', 13, 7, true, 80, true, true, 50, 30, 20, true, 'auto']
  );
  await pool.query('DELETE FROM profiles WHERE user_id = $1', [id]);
  assert.deepEqual((await u.get('/api/profile').expect(200)).body, {});
  // Une mise à jour recrée le profil
  assert.equal((await u.put('/api/profile', { firstName: 'Re' }).expect(200)).body.firstName, 'Re');
});

test('erreurs base sur le profil, les réglages et la réinitialisation → 500 (jamais de requête bloquée)', async () => {
  const { mock } = require('node:test');
  const u = await newUser();
  const auth = require('../src/middleware/auth');
  void auth;
  // Le middleware d'authentification lit la base : on laisse passer sa requête, on fait échouer la suivante
  const real = pool.query.bind(pool);
  let n = 0;
  const q = mock.method(pool, 'query', (...args) => (++n === 1 ? real(...args) : Promise.reject(new Error('panne'))));
  try {
    await u.get('/api/profile').expect(500);
    n = 0; await u.get('/api/settings').expect(500);
    n = 0; await u.put('/api/settings', { viewMode: 'weekly' }).expect(500);
    n = 0; await u.get('/api/push/public-key').expect(500);
    n = 0; await u.post('/api/push/subscribe', { subscription: { endpoint: 'https://x', keys: { p256dh: 'a', auth: 'b' } } }).expect(500);
    n = 0; await u.post('/api/push/unsubscribe', { endpoint: 'x' }).expect(500);
    n = 0; await u.post('/api/push/test').expect(500);
    n = 0; await u.put('/api/profile/balance', { balance: 1 }).expect(500);
    n = 0; await u.del('/api/profile/salary/pending').expect(500);
  } finally {
    q.mock.restore();
  }
  // Réinitialisation : échec au milieu de la transaction → annulée
  const realConnect = pool.connect.bind(pool);
  // pool.query appelle aussi pool.connect (avec un callback) : on ne simule que l'appel direct de la route
  const c = mock.method(pool, 'connect', async cb => {
    if (cb) return realConnect(cb);
    const client = await realConnect();
    const realClientQuery = client.query.bind(client);
    let k = 0;
    client.query = (...args) => (++k === 4 ? Promise.reject(new Error('panne')) : realClientQuery(...args));
    const release = client.release.bind(client);
    client.release = (...a) => { client.query = realClientQuery; return release(...a); };
    return client;
  });
  try {
    await u.post('/api/profile/reset', { password: u.password }).expect(500);
  } finally {
    c.mock.restore();
  }
  assert.equal((await u.get('/api/settings').expect(200)).body.view_mode, 'monthly');
});

test('enveloppes : erreurs base en lecture, reports et suppression → 500', async () => {
  const { mock } = require('node:test');
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'X', budgetMonthly: 1 })).body;
  const real = pool.query.bind(pool);
  let n = 0;
  const q = mock.method(pool, 'query', (...args) => (++n === 1 ? real(...args) : Promise.reject(new Error('panne'))));
  try {
    await u.get('/api/envelopes').expect(500);
    n = 0; await u.get('/api/envelopes/carryovers').expect(500);
    n = 0; await u.del(`/api/envelopes/${env.id}`).expect(500);
    n = 0; await u.get('/api/charges').expect(500);
    n = 0; await u.get('/api/goals').expect(500);
    n = 0; await u.get('/api/advances').expect(500);
    n = 0; await u.get('/api/withdrawals').expect(500);
    n = 0; await u.get('/api/recurring').expect(500);
    n = 0; await u.get('/api/savings').expect(500);
    n = 0; await u.get('/api/ai/history').expect(500);
    n = 0; await u.get('/api/bank/status').expect(500);
    n = 0; await u.get('/api/bank/transactions').expect(500);
    n = 0; await u.post('/api/bank/suggest', {}).expect(500);
  } finally {
    q.mock.restore();
  }
});
