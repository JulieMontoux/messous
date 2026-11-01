// Outils de test : base PostgreSQL réelle (DATABASE_URL), migrations, comptes jetables
process.env.NODE_ENV = 'test';
process.env.REGISTER_LIMIT = '1000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret_test_secret_test_secret_123';
process.env.TZ = process.env.TZ || 'Europe/Paris';

const request = require('supertest');
const crypto = require('crypto');
const { pool, migrate } = require('../src/db');
const app = require('../src/app');

let migrated = null;
function setup() {
  if (!migrated) migrated = migrate();
  return migrated;
}

// Crée un compte et renvoie un client authentifié
async function newUser() {
  await setup();
  const email = `test-${crypto.randomUUID()}@exemple.fr`;
  const password = 'motdepasse1';
  const res = await request(app).post('/api/auth/register').send({ email, password }).expect(200);
  const auth = { Authorization: `Bearer ${res.body.token}` };
  const call = method => (path, body) => {
    const r = request(app)[method](path).set(auth);
    return body !== undefined ? r.send(body) : r;
  };
  return { email, password, token: res.body.token, get: call('get'), post: call('post'), put: call('put'), patch: call('patch'), del: call('delete') };
}

function csvBody(lines, accountName = 'Compte test') {
  return { csv: ['Date;Libellé;Montant', ...lines].join('\n'), accountName };
}

// Date locale 'YYYY-MM-DD' décalée de n jours / 'DD/MM/YYYY' pour les CSV
function day(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d;
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fr = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

module.exports = { app, request, pool, setup, newUser, csvBody, day, iso, fr };
