const { test, after } = require('node:test');
const assert = require('node:assert');
const { pool, newUser, csvBody, day, fr } = require('./helpers');

after(() => pool.end());

// Un compte ne doit jamais pouvoir lire ni modifier les données d'un autre
test('isolation entre comptes', async () => {
  const alice = await newUser();
  const bob = await newUser();

  const env = (await alice.post('/api/envelopes', { name: 'Courses', categoryId: 'groceries', type: 'need', budgetMonthly: 300 })).body;
  const charge = (await alice.post('/api/charges', { name: 'Loyer', amount: 700 })).body;
  const goal = (await alice.post('/api/goals', { name: 'Vacances', targetAmount: 1000 })).body;
  const adv = (await alice.post('/api/advances', { person: 'Léa', amount: 20 })).body;
  const wd = (await alice.post('/api/withdrawals', { date: '2026-11-01', amount: 50 })).body;
  const tx = (await alice.post('/api/transactions', { envelopeId: env.id, amount: 10, date: '2026-11-01' })).body;
  await alice.post('/api/bank/import', csvBody([`${fr(day(0))};CB LIDL;-5,00`]));
  const [btx] = (await alice.get('/api/bank/transactions')).body;

  // Lecture : Bob ne voit rien
  for (const path of ['/api/envelopes', '/api/charges', '/api/goals', '/api/advances', '/api/withdrawals', '/api/transactions', '/api/bank/transactions']) {
    const list = (await bob.get(path).expect(200)).body;
    assert.equal(list.length, 0, `${path} doit être vide pour un autre compte`);
  }

  // Modification : refusée ou sans effet
  await bob.put(`/api/envelopes/${env.id}`, { name: 'Piraté', budgetMonthly: 1 }).expect(404);
  await bob.put(`/api/charges/${charge.id}`, { name: 'Piraté', amount: 1 }).expect(404);
  await bob.put(`/api/goals/${goal.id}`, { name: 'Piraté', targetAmount: 1, currentAmount: 0 }).expect(404);
  await bob.patch(`/api/goals/${goal.id}/deposit`, { amount: 999 }).expect(404);
  await bob.put(`/api/advances/${adv.id}/repaid`, { repaid: true }).expect(404);
  await bob.post(`/api/bank/transactions/${btx.id}/assign`, { envelopeId: env.id }).expect(400);
  await bob.post('/api/bank/transactions/bulk', { ids: [btx.id], ignore: true }).expect(200);

  // Suppressions : sans effet sur les données d'Alice
  await bob.del(`/api/envelopes/${env.id}`).expect(200);
  await bob.del(`/api/charges/${charge.id}`).expect(200);
  await bob.del(`/api/goals/${goal.id}`).expect(200);
  await bob.del(`/api/advances/${adv.id}`).expect(200);
  await bob.del(`/api/withdrawals/${wd.id}`).expect(200);
  await bob.del(`/api/transactions/${tx.id}`).expect(200);

  assert.equal((await alice.get('/api/envelopes')).body[0].name, 'Courses');
  assert.equal((await alice.get('/api/charges')).body.length, 1);
  assert.equal((await alice.get('/api/goals')).body[0].currentAmount, 0);
  assert.equal((await alice.get('/api/advances')).body[0].repaidAt, null);
  assert.equal((await alice.get('/api/withdrawals')).body.length, 1);
  assert.equal((await alice.get('/api/transactions')).body.length, 1);
  assert.equal((await alice.get('/api/bank/transactions')).body[0].ignored, false);
});

test('jeton invalide ou falsifié → 401', async () => {
  const { app, request } = require('./helpers');
  await request(app).get('/api/envelopes').set('Authorization', 'Bearer pas.un.jeton').expect(401);
  const jwt = require('jsonwebtoken');
  const forged = jwt.sign({ userId: '00000000-0000-0000-0000-000000000000' }, 'mauvais-secret');
  await request(app).get('/api/envelopes').set('Authorization', `Bearer ${forged}`).expect(401);
  const ghost = jwt.sign({ userId: '00000000-0000-0000-0000-000000000000' }, process.env.JWT_SECRET);
  await request(app).get('/api/envelopes').set('Authorization', `Bearer ${ghost}`).expect(401);
});
