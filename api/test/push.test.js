const { test, after } = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const webpush = require('web-push');
const { pool, newUser } = require('./helpers');

after(() => pool.end());

// Faux service push (celui du navigateur) : web-push n'envoie qu'en HTTPS, on remplace donc
// l'envoi réseau ; le chiffrement du message est tout de même exécuté pour valider l'abonnement.
function fakePushService(status) {
  const service = {
    hits: 0,
    payloads: [],
    address: () => ({ port: 443 }),
    close: () => { webpush.sendNotification = original; },
  };
  const original = webpush.sendNotification;
  webpush.sendNotification = async (sub, payload, options) => {
    webpush.generateRequestDetails(sub, payload, options);
    service.hits++;
    service.payloads.push(JSON.parse(payload));
    if (status >= 400) throw Object.assign(new Error('Received unexpected response code'), { statusCode: status });
    return { statusCode: status };
  };
  return Promise.resolve(service);
}

function fakeSubscription(port) {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  return {
    endpoint: `https://push.example.com:${port}/push/${crypto.randomUUID()}`,
    keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') },
  };
}

test('notification push : clé publique, abonnement, envoi de test', async () => {
  const u = await newUser();
  const { publicKey } = (await u.get('/api/push/public-key').expect(200)).body;
  assert.ok(publicKey.length > 40);

  await u.post('/api/push/test').expect(400);
  const service = await fakePushService(201);
  try {
    await u.post('/api/push/subscribe', { subscription: fakeSubscription(service.address().port) }).expect(200);
    const r = (await u.post('/api/push/test').expect(200)).body;
    assert.equal(r.sent, 1);
    assert.equal(service.hits, 1);
    assert.equal(service.payloads[0].title, '✅ MesSous');
  } finally {
    service.close();
  }
});

test('abonnement révoqué (410) : supprimé automatiquement', async () => {
  const u = await newUser();
  const service = await fakePushService(410);
  try {
    const sub = fakeSubscription(service.address().port);
    await u.post('/api/push/subscribe', { subscription: sub }).expect(200);
    await u.post('/api/push/test').expect(400);
    const { rows } = await pool.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
    assert.equal(rows.length, 0);
  } finally {
    service.close();
  }
});

test('alerte : envoyée en push même sans SMTP, une seule fois', async () => {
  const { sendOnce } = require('../src/lib/mailer');
  const u = await newUser();
  const service = await fakePushService(201);
  try {
    await u.post('/api/push/subscribe', { subscription: fakeSubscription(service.address().port) }).expect(200);
    const { rows: [me] } = await pool.query('SELECT id FROM users WHERE email = $1', [u.email]);
    const build = () => ({ subject: 'Test', html: '<p>x</p>', push: { title: 'Test', body: 'corps' } });
    assert.equal(await sendOnce(me.id, 'test_alert', 'ref1', build), true);
    assert.equal(await sendOnce(me.id, 'test_alert', 'ref1', build), false, 'pas de doublon');
    assert.equal(service.hits, 1);
  } finally {
    service.close();
  }
});
