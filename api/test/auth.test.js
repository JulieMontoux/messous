const { test, after } = require('node:test');
const assert = require('node:assert');
const { app, request, pool, newUser } = require('./helpers');

after(() => pool.end());

test('inscription puis connexion', async () => {
  const u = await newUser();
  const res = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password }).expect(200);
  assert.ok(res.body.token);
});

test('routes protégées sans jeton → 401', async () => {
  await request(app).get('/api/profile').expect(401);
});

test('trop de mots de passe erronés → 429, même avec le bon ensuite', async () => {
  const u = await newUser();
  for (let i = 0; i < 10; i++) {
    await request(app).post('/api/auth/login').send({ email: u.email, password: 'faux' }).expect(401);
  }
  const res = await request(app).post('/api/auth/login').send({ email: u.email, password: u.password }).expect(429);
  assert.match(res.body.error, /Trop de tentatives/);
  assert.ok(res.headers['retry-after']);
});

test('réinitialisation : mauvais mot de passe refusé, puis tout supprimé sauf le compte', async () => {
  const u = await newUser();
  await u.put('/api/profile', { firstName: 'Test', onboardingDone: true }).expect(200);
  await u.post('/api/charges', { name: 'Loyer', amount: 700 }).expect(200);
  await u.post('/api/withdrawals', { date: '2026-11-01', amount: 50 }).expect(200);

  await u.post('/api/profile/reset', { password: 'faux' }).expect(403);
  assert.equal((await u.get('/api/charges')).body.length, 1);

  await u.post('/api/profile/reset', { password: u.password }).expect(200);
  const profile = (await u.get('/api/profile')).body;
  assert.equal(profile.onboardingDone, false);
  assert.equal((await u.get('/api/charges')).body.length, 0);
  assert.equal((await u.get('/api/withdrawals')).body.length, 0);
  await request(app).post('/api/auth/login').send({ email: u.email, password: u.password }).expect(200);
});
