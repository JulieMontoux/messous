const { test, after } = require('node:test');
const assert = require('node:assert');
const { pool, newUser } = require('./helpers');
const { monthKey } = require('../src/lib/dates');

after(() => pool.end());

const now = new Date();
const thisMonth = monthKey(now);
const nextMonth = monthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));
const prevMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

test('salaire avec date d\'effet : en attente puis appliqué au mois venu', async () => {
  const u = await newUser();
  await u.put('/api/profile', { netSalary: 2000 }).expect(200);

  const p1 = (await u.put('/api/profile/salary', { amount: 2300, from: nextMonth }).expect(200)).body;
  assert.equal(p1.netSalary, 2000, 'le mois en cours garde l\'ancien salaire');
  assert.equal(p1.nextSalary, 2300);
  assert.equal(p1.nextSalaryFrom, nextMonth);

  // Simule l'arrivée du mois d'effet
  const { rows: [me] } = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
  await pool.query('UPDATE profiles SET next_salary_from = $2 WHERE user_id = $1', [me.id, thisMonth]);
  const p2 = (await u.get('/api/profile').expect(200)).body;
  assert.equal(p2.netSalary, 2300);
  assert.equal(p2.nextSalary, null);

  const p3 = (await u.put('/api/profile/salary', { amount: 2400, from: thisMonth }).expect(200)).body;
  assert.equal(p3.netSalary, 2400, 'immédiat pour le mois en cours');
});

test('répartition du budget idéal enregistrée dans le profil', async () => {
  const u = await newUser();
  const p = (await u.put('/api/profile', { idealNeedsPct: 60, idealWantsPct: 20, idealSavingsPct: 20 }).expect(200)).body;
  assert.deepEqual([p.idealNeedsPct, p.idealWantsPct, p.idealSavingsPct], [60, 20, 20]);
});

test('clôture du mois : restes reportés sur le mois suivant, remplacés si on modifie', async () => {
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'Cadeaux', categoryId: 'gifts', type: 'want', budgetMonthly: 50 })).body;
  await u.put(`/api/savings/${prevMonth}/close`, {
    actualSavings: 100, actualRemainder: 0, carryovers: [{ envelopeId: env.id, amount: 35 }],
  }).expect(200);
  let list = (await u.get('/api/envelopes/carryovers').expect(200)).body;
  assert.deepEqual(list, [{ envelopeId: env.id, month: thisMonth, amount: 35 }]);

  await u.put(`/api/savings/${prevMonth}/close`, { actualSavings: 100, actualRemainder: 0, carryovers: [] }).expect(200);
  list = (await u.get('/api/envelopes/carryovers').expect(200)).body;
  assert.equal(list.length, 0);
});

test('bilan mensuel : dépenses par enveloppe, dépassements, comparaison avec le mois précédent', async () => {
  const { renderMonthlyReport, shiftMonth } = require('../src/lib/report');
  const u = await newUser();
  const courses = (await u.post('/api/envelopes', { name: 'Courses', categoryId: 'groceries', type: 'need', budgetMonthly: 300 })).body;
  const restos = (await u.post('/api/envelopes', { name: 'Restos', categoryId: 'restaurant', type: 'want', budgetMonthly: 100 })).body;
  const before = shiftMonth(prevMonth, -1);
  await u.post('/api/transactions', { envelopeId: courses.id, amount: 250, date: `${prevMonth}-05` });
  await u.post('/api/transactions', { envelopeId: restos.id, amount: 140, date: `${prevMonth}-12` });
  await u.post('/api/transactions', { envelopeId: courses.id, amount: 300, date: `${before}-10` });

  const r = (await u.get(`/api/savings/${prevMonth}/report`).expect(200)).body;
  assert.equal(r.totalSpent, 390);
  assert.equal(r.totalBudget, 400);
  assert.equal(r.previousSpent, 300);
  assert.deepEqual(r.over.map(l => l.name), ['Restos']);

  const mail = renderMonthlyReport(r, 'Julie');
  assert.match(mail.subject, /bilan/);
  assert.match(mail.html, /\+30 %/);
  assert.match(mail.html, /Restos \(40/);
});
