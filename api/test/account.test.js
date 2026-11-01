const { test, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const { app, request, pool, newUser, userId, csvBody, day, fr } = require('./helpers');
const mailer = require('../src/lib/mailer');

after(() => pool.end());

const APP_URL = 'https://budget.exemple.fr';

// Intercepte les e-mails de sécurité et renvoie la liste des envois
function captureSecurityMails(t) {
  const sent = [];
  t.mock.method(mailer, 'sendMail', async mail => { sent.push(mail); return true; });
  return sent;
}

const tokenFromMail = mail => mail.html.match(/#reset=([\w-]+)/)[1];
const login = (email, password) => request(app).post('/api/auth/login').send({ email, password });

async function askReset(t, email) {
  const saved = process.env.APP_URL;
  process.env.APP_URL = APP_URL;
  const sent = captureSecurityMails(t);
  try {
    const res = await request(app).post('/api/auth/forgot').send({ email }).expect(200);
    assert.deepEqual(res.body, { ok: true });
  } finally {
    if (saved === undefined) delete process.env.APP_URL; else process.env.APP_URL = saved;
  }
  return sent;
}

test('mot de passe oublié : lien par e-mail, nouveau mot de passe, ancienne session coupée', async (t) => {
  const u = await newUser();
  const sent = await askReset(t, `  ${u.email.toUpperCase()} `);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, u.email);
  assert.match(sent[0].subject, /Réinitialiser/);
  assert.ok(sent[0].html.includes(`${APP_URL}/#reset=`), 'lien vers l\'app, jeton dans le fragment');
  assert.match(sent[0].html, /1 heure/);
  assert.match(sent[0].html, /E-mail de sécurité/);
  const token = tokenFromMail(sent[0]);

  // Seule l'empreinte du jeton est stockée
  const { rows } = await pool.query('SELECT token_hash FROM password_resets WHERE user_id = $1', [await userId(u)]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
  assert.equal(rows[0].token_hash, crypto.createHash('sha256').update(token).digest('hex'));

  await request(app).post('/api/auth/reset').send({ token, password: '123' }).expect(400);
  const res = await request(app).post('/api/auth/reset').send({ token, password: 'nouveau-mdp' }).expect(200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, u.email);
  assert.match(sent.at(-1).subject, /a été changé/);

  // Nouveau jeton valable, ancien jeton refusé, ancien mot de passe refusé
  await request(app).get('/api/profile').set('Authorization', `Bearer ${res.body.token}`).expect(200);
  const old = await u.get('/api/profile').expect(401);
  assert.match(old.body.error, /Session expirée/);
  await login(u.email, u.password).expect(401);
  await login(u.email, 'nouveau-mdp').expect(200);

  // Le lien ne sert qu'une fois
  const again = await request(app).post('/api/auth/reset').send({ token, password: 'encore-un' }).expect(400);
  assert.match(again.body.error, /invalide ou expiré/);
});

test('mot de passe oublié : adresse inconnue → même réponse, aucun e-mail ; e-mail requis', async (t) => {
  const sent = await askReset(t, 'personne-inconnue@exemple.fr');
  assert.equal(sent.length, 0);
  await request(app).post('/api/auth/forgot').send({}).expect(400);
});

test('mot de passe oublié : nouvelle demande → seul le dernier lien fonctionne', async (t) => {
  const u = await newUser();
  const first = tokenFromMail((await askReset(t, u.email))[0]);
  t.mock.restoreAll();
  const second = tokenFromMail((await askReset(t, u.email))[0]);
  await request(app).post('/api/auth/reset').send({ token: first, password: 'nouveau-mdp' }).expect(400);
  await request(app).post('/api/auth/reset').send({ token: second, password: 'nouveau-mdp' }).expect(200);
});

test('mot de passe oublié : lien expiré refusé, jeton absent refusé', async () => {
  const u = await newUser();
  const token = 'jeton-expire-' + crypto.randomUUID();
  await pool.query(
    "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 minute')",
    [await userId(u), crypto.createHash('sha256').update(token).digest('hex')]
  );
  await request(app).post('/api/auth/reset').send({ token, password: 'nouveau-mdp' }).expect(400);
  await request(app).post('/api/auth/reset').send({ password: 'nouveau-mdp' }).expect(400);
  await login(u.email, u.password).expect(200);
});

test('mot de passe oublié : sans APP_URL, aucun lien n\'est créé (pas de lien vers un hôte non maîtrisé)', async (t) => {
  const u = await newUser();
  const saved = process.env.APP_URL;
  delete process.env.APP_URL;
  const sent = captureSecurityMails(t);
  const errors = [];
  t.mock.method(console, 'error', (...a) => errors.push(a.join(' ')));
  try {
    await request(app).post('/api/auth/forgot').set('Host', 'pirate.example').send({ email: u.email }).expect(200);
  } finally {
    if (saved !== undefined) process.env.APP_URL = saved;
  }
  assert.equal(sent.length, 0);
  assert.ok(errors.some(e => /APP_URL/.test(e)));
  const { rows } = await pool.query('SELECT 1 FROM password_resets WHERE user_id = $1', [await userId(u)]);
  assert.equal(rows.length, 0);
});

test('mot de passe oublié : limité à 3 demandes par adresse et par heure', async (t) => {
  const u = await newUser();
  for (let i = 0; i < 3; i++) await askReset(t, u.email);
  const res = await request(app).post('/api/auth/forgot').send({ email: u.email }).expect(429);
  assert.ok(res.headers['retry-after']);
});

test('changer son mot de passe : mot de passe actuel exigé, autres appareils déconnectés', async (t) => {
  const u = await newUser();
  const sent = captureSecurityMails(t);
  const other = (await login(u.email, u.password).expect(200)).body.token;

  await u.put('/api/auth/password', { currentPassword: 'faux', newPassword: 'nouveau-mdp' }).expect(403);
  await u.put('/api/auth/password', { currentPassword: u.password, newPassword: '123' }).expect(400);
  await u.put('/api/auth/password', { currentPassword: u.password }).expect(400);
  assert.equal(sent.length, 0);

  const res = await u.put('/api/auth/password', { currentPassword: u.password, newPassword: 'nouveau-mdp' }).expect(200);
  assert.ok(res.body.token);
  assert.equal(sent.length, 1);
  assert.match(sent[0].subject, /a été changé/);

  await request(app).get('/api/profile').set('Authorization', `Bearer ${res.body.token}`).expect(200);
  await request(app).get('/api/profile').set('Authorization', `Bearer ${other}`).expect(401);
  await u.get('/api/profile').expect(401);
  await login(u.email, u.password).expect(401);
  await login(u.email, 'nouveau-mdp').expect(200);
});

test('changer son mot de passe : un demi-lien « mot de passe oublié » en attente est annulé', async (t) => {
  const u = await newUser();
  const token = tokenFromMail((await askReset(t, u.email))[0]);
  await u.put('/api/auth/password', { currentPassword: u.password, newPassword: 'nouveau-mdp' }).expect(200);
  await request(app).post('/api/auth/reset').send({ token, password: 'pirate-mdp' }).expect(400);
});

test('mauvais mot de passe actuel répété → 429', async (t) => {
  const u = await newUser();
  captureSecurityMails(t);
  for (let i = 0; i < 10; i++) {
    await u.put('/api/auth/password', { currentPassword: 'faux', newPassword: 'nouveau-mdp' }).expect(403);
  }
  await u.put('/api/auth/password', { currentPassword: u.password, newPassword: 'nouveau-mdp' }).expect(429);
  await u.del('/api/auth/account', { password: u.password }).expect(429);
});

test('supprimer son compte : mot de passe exigé, puis plus aucune donnée nulle part', async (t) => {
  const u = await newUser();
  const id = await userId(u);
  const sent = captureSecurityMails(t);
  await u.put('/api/profile', { firstName: 'Test', onboardingDone: true }).expect(200);
  const env = (await u.post('/api/envelopes', { name: 'Courses', categoryId: 'groceries', type: 'need', budgetMonthly: 300 })).body;
  await u.post('/api/transactions', { envelopeId: env.id, amount: 10, date: '2026-11-01' }).expect(200);
  await u.post('/api/charges', { name: 'Loyer', amount: 700 }).expect(200);
  await u.post('/api/goals', { name: 'Vacances', targetAmount: 1000 }).expect(200);
  await u.post('/api/advances', { person: 'Léa', amount: 20 }).expect(200);
  await u.post('/api/bank/import', csvBody([`${fr(day(0))};CB LIDL;-5,00`, `${fr(day(0))};RETRAIT DAB;-20,00`])).expect(200);
  const [btx] = (await u.get('/api/bank/transactions')).body.filter(b => /LIDL/.test(b.label));
  await u.post(`/api/bank/transactions/${btx.id}/assign`, { envelopeId: env.id }).expect(200);

  await u.del('/api/auth/account', { password: 'faux' }).expect(403);
  await u.del('/api/auth/account').expect(403);
  assert.equal((await u.get('/api/envelopes')).body.length, 1);

  await u.del('/api/auth/account', { password: u.password }).expect(200);
  assert.equal(sent.at(-1).to, u.email);
  assert.match(sent.at(-1).subject, /supprimé/);

  await u.get('/api/envelopes').expect(401);
  await login(u.email, u.password).expect(401);
  const { rows: tables } = await pool.query(
    "SELECT table_name FROM information_schema.columns WHERE column_name = 'user_id' AND table_schema = 'public'"
  );
  assert.ok(tables.length >= 15);
  for (const { table_name: table } of tables) {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE user_id = $1`, [id]);
    assert.equal(rows[0].n, 0, `${table} doit être vide après suppression`);
  }

  // L'adresse est de nouveau libre
  await request(app).post('/api/auth/register').send({ email: u.email, password: 'motdepasse1' }).expect(200);
});

test('e-mail de sécurité en échec : l\'action réussit quand même', async (t) => {
  const u = await newUser();
  const errors = [];
  t.mock.method(console, 'error', (...a) => errors.push(a.join(' ')));
  t.mock.method(mailer, 'sendMail', async () => { throw new Error('SMTP en panne'); });
  await u.put('/api/auth/password', { currentPassword: u.password, newPassword: 'nouveau-mdp' }).expect(200);
  assert.ok(errors.some(e => /SMTP en panne/.test(e)));
});

test('erreurs base de données : 500 sans détail', async (t) => {
  const u = await newUser();
  const tokenRes = (await login(u.email, u.password)).body.token;
  t.mock.method(console, 'error', () => {});
  const realQuery = pool.query.bind(pool);
  // La vérification du jeton passe, la requête suivante échoue
  t.mock.method(pool, 'query', async (sql, ...rest) => {
    if (/token_version FROM users WHERE id/.test(sql)) return realQuery(sql, ...rest);
    throw new Error('base indisponible');
  });
  const auth = { Authorization: `Bearer ${tokenRes}` };
  for (const [method, path, body] of [
    ['post', '/api/auth/forgot', { email: u.email }],
    ['post', '/api/auth/reset', { token: 'x', password: 'nouveau-mdp' }],
    ['put', '/api/auth/password', { currentPassword: u.password, newPassword: 'nouveau-mdp' }],
    ['delete', '/api/auth/account', { password: u.password }],
  ]) {
    const res = await request(app)[method](path).set(auth).send(body).expect(500);
    assert.equal(res.body.error, 'Erreur serveur');
  }
});
