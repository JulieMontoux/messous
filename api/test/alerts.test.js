const { test, after } = require('node:test');
const assert = require('node:assert');
const { pool, newUser, captureMails, userId, day, iso } = require('./helpers');
const { checkEnvelopeAlert } = require('../src/lib/alerts');

after(() => pool.end());

const today = iso(day(0));

async function setup(budget = 100, extra = {}) {
  const u = await newUser();
  await u.put('/api/profile', { onboardingDone: true, alertThreshold: 80, ...extra }).expect(200);
  const env = (await u.post('/api/envelopes', { name: 'Restos', categoryId: 'restaurant', type: 'want', budgetMonthly: budget })).body;
  return { u, env, id: await userId(u) };
}

// Insertion directe (l'API déclenche elle-même une vérification d'alerte en arrière-plan,
// qui ferait doublon avec celle testée ici)
async function spend(u, env, amount, date = today) {
  await pool.query('INSERT INTO transactions (user_id, envelope_id, amount, date) VALUES ($1, $2, $3, $4)', [await userId(u), env.id, amount, date]);
}

test('sous le seuil : pas d\'alerte ; au seuil : alerte ; dépassé : alerte « dépassée »', async () => {
  const { u, env, id } = await setup(100);
  await spend(u, env, 50);
  assert.equal((await captureMails(() => checkEnvelopeAlert(id, env.id, today))).length, 0);

  await spend(u, env, 35);
  const at85 = await captureMails(() => checkEnvelopeAlert(id, env.id, today));
  assert.equal(at85.length, 1);
  assert.match(at85[0], /Restos.*85%/);

  await spend(u, env, 30);
  const over = await captureMails(() => checkEnvelopeAlert(id, env.id, today));
  assert.match(over[0], /dépassée/);
});

test('alertes désactivées dans le profil : rien', async () => {
  const { u, env, id } = await setup(100, { alertsEnabled: false });
  await spend(u, env, 150);
  assert.equal((await captureMails(() => checkEnvelopeAlert(id, env.id, today))).length, 0);
});

test('enveloppe d\'épargne : jamais d\'alerte', async () => {
  const u = await newUser();
  const env = (await u.post('/api/envelopes', { name: 'Livret', categoryId: 'livret', type: 'saving', budgetMonthly: 50 })).body;
  await spend(u, env, 200);
  const id = await userId(u);
  assert.equal((await captureMails(() => checkEnvelopeAlert(id, env.id, today))).length, 0);
});

test('tabac : alerte quand il ne reste plus de quoi acheter un paquet, sauf pendant un arrêt', async () => {
  const u = await newUser();
  await u.put('/api/profile', { tobaccoPackPrice: 13, tobaccoType: 'indus' }).expect(200);
  const env = (await u.post('/api/envelopes', { name: 'Tabac', categoryId: 'tobacco', type: 'want', budgetMonthly: 100 })).body;
  const id = await userId(u);
  await spend(u, env, 90);
  const mails = await captureMails(() => checkEnvelopeAlert(id, env.id, today));
  assert.match(mails[0], /tabac/i);

  await u.put('/api/profile', { tobaccoQuitDate: today }).expect(200);
  assert.equal((await captureMails(() => checkEnvelopeAlert(id, env.id, today))).length, 0);
});

test('dépense future ou d\'un autre mois : aucune alerte', async () => {
  const { u, env, id } = await setup(100);
  await spend(u, env, 150);
  assert.equal((await captureMails(() => checkEnvelopeAlert(id, env.id, iso(day(45))))).length, 0);
  assert.equal((await captureMails(() => checkEnvelopeAlert(id, env.id, iso(day(-40))))).length, 0);
  assert.equal((await captureMails(() => checkEnvelopeAlert(id, env.id, undefined))).length, 0);
});

test('une dépense saisie dans l\'app déclenche l\'alerte toute seule', async () => {
  const { u, env } = await setup(100);
  const logs = await captureMails(async () => {
    await u.post('/api/transactions', { envelopeId: env.id, amount: 90, date: today }).expect(200);
    await new Promise(r => setTimeout(r, 300));
  });
  assert.equal(logs.length, 1);
  assert.match(logs[0], /Restos.*90%/);
});
