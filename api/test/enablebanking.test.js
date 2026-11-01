const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const jwt = require('jsonwebtoken');
const { app, request, pool, newUser, userId, day, iso } = require('./helpers');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.ENABLE_BANKING_APP_ID = 'app-test';
process.env.ENABLE_BANKING_PRIVATE_KEY = PEM.replace(/\n/g, '\\n');
process.env.APP_URL = 'https://messous.example';

const eb = require('../src/lib/bank/enablebanking');

// Fausse API Enable Banking : réponses par chemin, appels mémorisés
const realFetch = global.fetch;
let calls = [];
let routes = {};
function mockBank(map) {
  routes = map;
  calls = [];
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    calls.push({ method: opts.method || 'GET', path: u.pathname, search: u.search, headers: opts.headers, body: opts.body && JSON.parse(opts.body) });
    const key = Object.keys(routes).find(k => {
      const [m, p] = k.split(' ');
      return m === (opts.method || 'GET') && (p.endsWith('*') ? u.pathname.startsWith(p.slice(0, -1)) : u.pathname === p);
    });
    const handler = routes[key];
    const res = typeof handler === 'function' ? handler(u, opts) : handler;
    if (!res) return { ok: false, status: 404, json: async () => ({ message: `non simulé : ${u.pathname}` }) };
    return { ok: (res.status || 200) < 400, status: res.status || 200, json: async () => res.body ?? {} };
  };
}
beforeEach(() => mockBank({}));
after(() => { global.fetch = realFetch; return pool.end(); });

const tx = (id, amount, dir, label, date = iso(day(0))) => ({
  transaction_id: id, status: 'BOOK', booking_date: date, credit_debit_indicator: dir,
  transaction_amount: { amount: String(amount), currency: 'EUR' }, remittance_information: [label],
});

test('jeton signé RS256 avec l\'identifiant de l\'application', async () => {
  mockBank({ 'GET /aspsps': { body: { aspsps: [{ name: 'Ma Banque', country: 'FR', logo: 'x.png', extra: 1 }] } } });
  const banks = await eb.listBanks('FR');
  assert.deepEqual(banks, [{ name: 'Ma Banque', country: 'FR', logo: 'x.png' }]);
  const token = calls[0].headers.Authorization.slice(7);
  const decoded = jwt.verify(token, publicKey.export({ type: 'spki', format: 'pem' }), { algorithms: ['RS256'] });
  assert.equal(decoded.aud, 'api.enablebanking.com');
  assert.equal(jwt.decode(token, { complete: true }).header.kid, 'app-test');
  assert.match(calls[0].search, /psu_type=personal/);
});

test('clé privée lue depuis un fichier si pas en variable', async () => {
  const file = path.join(os.tmpdir(), `eb-${Date.now()}.pem`);
  fs.writeFileSync(file, PEM);
  const saved = process.env.ENABLE_BANKING_PRIVATE_KEY;
  delete process.env.ENABLE_BANKING_PRIVATE_KEY;
  process.env.ENABLE_BANKING_KEY_PATH = file;
  try {
    assert.equal(eb.isConfigured(), true);
    mockBank({ 'GET /aspsps': { body: {} } });
    assert.deepEqual(await eb.listBanks(), []);
  } finally {
    process.env.ENABLE_BANKING_PRIVATE_KEY = saved;
    delete process.env.ENABLE_BANKING_KEY_PATH;
    fs.unlinkSync(file);
  }
});

test('erreur de l\'API bancaire : message remonté', async () => {
  mockBank({ 'GET /aspsps': { status: 401, body: { message: 'Signature invalide' } } });
  await assert.rejects(eb.listBanks(), /Signature invalide/);
  mockBank({ 'GET /aspsps': { status: 500, body: {} } });
  await assert.rejects(eb.listBanks(), /Enable Banking 500/);
});

test('session : comptes au format objet ou identifiant seul', async () => {
  mockBank({ 'POST /sessions': { body: { session_id: 's1', access: { valid_until: '2027-05-01T00:00:00Z' }, accounts: [{ uid: 'a1', name: 'Courant', account_id: { iban: 'FR76' } }, 'a2'] } } });
  const s = await eb.createSession('code');
  assert.deepEqual(s, { sessionId: 's1', validUntil: '2027-05-01T00:00:00Z', accounts: [{ uid: 'a1', name: 'Courant', iban: 'FR76' }, { uid: 'a2', name: '', iban: '' }] });
  mockBank({ 'POST /sessions': { body: { accounts: [{ uid: 'a3', product: 'Livret' }] } } });
  assert.deepEqual((await eb.createSession('c')).accounts[0], { uid: 'a3', name: 'Livret', iban: '' });
});

test('solde : disponible en priorité, sinon solde comptable, sinon le premier', async () => {
  mockBank({ 'GET /accounts/*': { body: { balances: [{ balance_type: 'CLBD', balance_amount: { amount: '10' } }, { balance_type: 'ITAV', balance_amount: { amount: '12.5' } }] } } });
  assert.equal(await eb.fetchBalance('a1'), 12.5);
  mockBank({ 'GET /accounts/*': { body: { balances: [{ balance_type: 'OTHR', balance_amount: { amount: '3' } }, { balance_type: 'CLBD', balance_amount: { amount: '7' } }] } } });
  assert.equal(await eb.fetchBalance('a1'), 7);
  mockBank({ 'GET /accounts/*': { body: { balances: [{ balance_type: 'OTHR', balance_amount: { amount: '3' } }] } } });
  assert.equal(await eb.fetchBalance('a1'), 3);
  mockBank({ 'GET /accounts/*': { body: {} } });
  assert.equal(await eb.fetchBalance('a1'), null);
});

test('opérations : pagination, statuts ignorés, libellé de secours, identifiant de secours', async () => {
  let page = 0;
  mockBank({
    'GET /accounts/*': () => {
      page++;
      if (page === 1) return { body: { transactions: [tx('t1', 5, 'DBIT', 'CB LIDL'), { ...tx('t2', 9, 'DBIT', 'X'), status: 'RJCT' }], continuation_key: 'k2' } };
      return { body: { transactions: [{ entry_reference: 'e3', booking_date: null, value_date: '2026-11-03', credit_debit_indicator: 'CRDT', transaction_amount: { amount: '100' }, debtor: { name: 'EMPLOYEUR' } },
        { booking_date: '2026-11-04', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '1' }, bank_transaction_code: { description: 'Frais', code: 'CCRD' } },
        { transaction_amount: { amount: '1' } }] } };
    },
  });
  const list = await eb.fetchTransactions('a1', '2026-10-01');
  assert.equal(page, 2);
  assert.match(calls[1].search, /continuation_key=k2/);
  assert.deepEqual(list.map(t => [t.externalId.slice(0, 5), t.amount, t.label, t.isCard]), [
    ['eb:t1', -5, 'CB LIDL', true],
    ['eb:e3', 100, 'EMPLOYEUR', false],
    [list[2].externalId.slice(0, 5), -1, 'Frais', true],
  ]);
});

test('connexion : URL de consentement, retour de la banque, première synchro, statut', async () => {
  const u = await newUser();
  mockBank({ 'POST /auth': { body: { url: 'https://banque.example/consent' } } });
  const r = (await u.post('/api/bank/connect', { bankName: 'Ma Banque' }).expect(200)).body;
  assert.equal(r.url, 'https://banque.example/consent');
  const auth = calls[0].body;
  assert.equal(auth.redirect_url, 'https://messous.example/api/bank/callback');
  assert.equal(auth.aspsp.name, 'Ma Banque');

  mockBank({
    'POST /sessions': { body: { session_id: 'sess', access: { valid_until: new Date(Date.now() + 90 * 86400000).toISOString() }, accounts: [{ uid: 'acc1', name: 'Courant', account_id: { iban: 'FR7612345' } }] } },
    'GET /accounts/acc1/transactions': { body: { transactions: [tx('x1', 23.4, 'DBIT', 'CB MONOPRIX'), tx('x2', 60, 'DBIT', 'RETRAIT DAB PARIS')] } },
    'GET /accounts/acc1/balances': { body: { balances: [{ balance_type: 'ITAV', balance_amount: { amount: '1520.75' } }] } },
  });
  const cb = await request(app).get(`/api/bank/callback?state=${auth.state}&code=abc`).expect(302);
  assert.equal(cb.headers.location, 'https://messous.example/?page=bank&bank=ok');

  const status = (await u.get('/api/bank/status').expect(200)).body;
  assert.equal(status.providerConfigured, true);
  assert.equal(status.connections[0].status, 'active');
  assert.equal(status.accounts[0].balance, 1520.75);
  const ops = (await u.get('/api/bank/transactions')).body;
  assert.equal(ops.length, 2);
  assert.ok(ops.find(o => o.label.includes('RETRAIT')).withdrawalId);

  // Synchro manuelle : rien de nouveau
  const sync = (await u.post('/api/bank/sync').expect(200)).body;
  assert.equal(sync.inserted, 0);

  // Déconnexion : session supprimée côté banque, connexion et opérations supprimées
  mockBank({ 'DELETE /sessions/sess': { body: {} } });
  await u.del(`/api/bank/connections/${status.connections[0].id}`).expect(200);
  assert.equal(calls[0].method, 'DELETE');
  assert.equal((await u.get('/api/bank/status')).body.connections.length, 0);
  await u.del(`/api/bank/connections/${status.connections[0].id}`).expect(404);
});

test('retour de la banque : refus, état inconnu, erreur de session', async () => {
  const u = await newUser();
  mockBank({ 'POST /auth': { body: { url: 'u' } } });
  await u.post('/api/bank/connect', { bankName: 'B' }).expect(200);
  const state = calls[0].body.state;

  const loc = async q => (await request(app).get(`/api/bank/callback${q}`).expect(302)).headers.location;
  assert.match(await loc(''), /bank=error/);
  assert.match(await loc('?state=inconnu&code=x'), /bank=error/);
  assert.match(await loc(`?state=${state}&error=access_denied`), /bank=error/);
  const { rows: [c] } = await pool.query('SELECT status, last_error FROM bank_connections WHERE user_id = $1', [await userId(u)]);
  assert.equal(c.status, 'error');
  assert.equal(c.last_error, 'access_denied');

  await u.post('/api/bank/connect', { bankName: 'B' });
  const state2 = calls[0].body.state;
  mockBank({ 'POST /sessions': { status: 400, body: { message: 'code expiré' } } });
  assert.match(await loc(`?state=${state2}&code=x`), /bank=error/);
});

test('routes bancaires : erreurs et connecteur non configuré', async () => {
  const u = await newUser();
  await u.post('/api/bank/connect', {}).expect(400);
  mockBank({ 'POST /auth': { status: 502, body: { message: 'banque indisponible' } } });
  assert.match((await u.post('/api/bank/connect', { bankName: 'B' }).expect(502)).body.error, /indisponible/);
  mockBank({ 'GET /aspsps': { body: { aspsps: [{ name: 'B', country: 'FR' }] } } });
  assert.equal((await u.get('/api/bank/banks').expect(200)).body.length, 1);
  mockBank({ 'GET /aspsps': { status: 500 } });
  await u.get('/api/bank/banks').expect(502);

  const saved = process.env.ENABLE_BANKING_APP_ID;
  delete process.env.ENABLE_BANKING_APP_ID;
  try {
    await u.get('/api/bank/banks').expect(400);
    await u.post('/api/bank/connect', { bankName: 'B' }).expect(400);
  } finally {
    process.env.ENABLE_BANKING_APP_ID = saved;
  }
});

test('synchro : connexion expirée, erreur mémorisée, synchro automatique planifiée', async () => {
  const { syncConnection } = require('../src/lib/bank/sync');
  const u = await newUser();
  const id = await userId(u);
  const { rows: [expired] } = await pool.query(
    "INSERT INTO bank_connections (user_id, provider, status, valid_until) VALUES ($1, 'enablebanking', 'active', NOW() - INTERVAL '1 day') RETURNING *", [id]);
  assert.deepEqual(await syncConnection(expired), { inserted: 0, assigned: 0 });
  assert.equal((await pool.query('SELECT status FROM bank_connections WHERE id = $1', [expired.id])).rows[0].status, 'expired');
  assert.deepEqual(await syncConnection({ provider: 'csv', status: 'active' }), { inserted: 0, assigned: 0 });

  const { rows: [conn] } = await pool.query(
    "INSERT INTO bank_connections (user_id, provider, status, last_sync_at) VALUES ($1, 'enablebanking', 'active', NOW()) RETURNING *", [id]);
  await pool.query("INSERT INTO bank_accounts (user_id, connection_id, external_uid, name) VALUES ($1, $2, 'zz', 'Compte')", [id, conn.id]);
  mockBank({ 'GET /accounts/zz/transactions': { status: 503, body: { message: 'maintenance' } } });
  await assert.rejects(syncConnection(conn), /maintenance/);
  assert.equal((await pool.query('SELECT last_error FROM bank_connections WHERE id = $1', [conn.id])).rows[0].last_error, 'maintenance');
  await u.post('/api/bank/sync').expect(502);

  // Synchro planifiée : passe sur toutes les connexions actives, sans planter sur les erreurs
  const { bankAutoSync } = require('../src/lib/scheduler');
  mockBank({
    'GET /accounts/zz/transactions': { body: { transactions: [tx(`auto-${Date.now()}`, 4, 'DBIT', 'CB BOULANGERIE')] } },
    'GET /accounts/zz/balances': { status: 500 },
  });
  await bankAutoSync({ force: true });
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM bank_transactions WHERE user_id = $1', [id]);
  assert.equal(rows[0].n, 1);
});
