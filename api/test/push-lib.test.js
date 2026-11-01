const { test, after, mock } = require('node:test');
const assert = require('node:assert');
const webpush = require('web-push');

const keys = webpush.generateVAPIDKeys();
process.env.VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;
process.env.SMTP_FROM = 'MesSous <bonjour@messous.example>';

const { pool, newUser, userId } = require('./helpers');
const { getVapid, sendPush } = require('../src/lib/push');

after(() => pool.end());

test('clés VAPID fournies par l\'environnement, sujet tiré de SMTP_FROM', async () => {
  const setDetails = mock.method(webpush, 'setVapidDetails');
  const v = await getVapid();
  assert.equal(v.publicKey, keys.publicKey);
  assert.equal(setDetails.mock.calls[0].arguments[0], 'mailto:bonjour@messous.example');
  setDetails.mock.restore();
});

test('erreur d\'envoi autre que 404/410 : abonnement conservé', async () => {
  const u = await newUser();
  const id = await userId(u);
  const endpoint = `https://push.example.com/${Date.now()}`;
  await pool.query("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, 'a', 'b')", [id, endpoint]);
  const send = mock.method(webpush, 'sendNotification', async () => { throw Object.assign(new Error('surcharge'), { statusCode: 503 }); });
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    assert.equal(await sendPush(id, { title: 'T' }), 0);
  } finally {
    console.error = orig;
    send.mock.restore();
  }
  assert.match(errors[0], /503 surcharge/);
  const { rows } = await pool.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  assert.equal(rows.length, 1);
});
