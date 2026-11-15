const { test, after, before } = require('node:test');
const assert = require('node:assert');
const net = require('net');

// Faux serveur SMTP minimal : mémorise les messages reçus
const received = [];
let server;
before(async () => {
  server = net.createServer(sock => {
    let data = null;
    sock.write('220 test ESMTP\r\n');
    let buffer = '';
    sock.on('data', chunk => {
      buffer += chunk.toString();
      let i;
      while ((i = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (data !== null) {
          if (line === '.') { received.push(data); data = null; sock.write('250 OK\r\n'); } else data += `${line}\n`;
        } else if (/^(EHLO|HELO)/i.test(line)) sock.write('250-test\r\n250 AUTH PLAIN\r\n');
        else if (/^AUTH/i.test(line)) sock.write('235 OK\r\n');
        else if (/^DATA/i.test(line)) { data = ''; sock.write('354 go\r\n'); }
        else if (/^QUIT/i.test(line)) { sock.end('221 bye\r\n'); }
        else sock.write('250 OK\r\n');
      }
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(server.address().port);
  process.env.SMTP_SECURE = 'false';
  process.env.SMTP_USER = 'messous';
  process.env.SMTP_PASS = 'x';
  process.env.SMTP_FROM = 'MesSous <messous@exemple.fr>';
});

const { pool, newUser, userId } = require('./helpers');
after(() => { server.close(); return pool.end(); });

test('e-mail de test envoyé à l\'adresse d\'alerte du profil', async () => {
  const u = await newUser();
  assert.equal((await u.get('/api/profile')).body.mailConfigured, true);
  await u.put('/api/profile', { alertEmail: 'alertes@exemple.fr' });
  const r = (await u.post('/api/profile/test-email').expect(200)).body;
  assert.equal(r.to, 'alertes@exemple.fr');
  const last = received.at(-1);
  assert.match(last, /To: alertes@exemple.fr/);
  assert.match(last, /MesSous/);
});

test('sendOnce : envoyé une seule fois, puis plus rien', async () => {
  const { sendOnce } = require('../src/lib/mailer');
  const u = await newUser();
  const id = await userId(u);
  const before = received.length;
  const build = ({ email }) => ({ subject: `Pour ${email}`, html: '<p>x</p>' });
  assert.equal(await sendOnce(id, 'k', 'r1', build), true);
  assert.equal(await sendOnce(id, 'k', 'r1', build), false);
  assert.equal(received.length, before + 1);
  assert.match(received.at(-1), new RegExp(`To: ${u.email}`));
});

test('sendOnce : erreur de construction → rien d\'enregistré, nouvel essai possible', async () => {
  const { sendOnce } = require('../src/lib/mailer');
  const u = await newUser();
  const id = await userId(u);
  assert.equal(await sendOnce(id, 'k', 'r2', () => { throw new Error('boum'); }), false);
  assert.equal(await sendOnce(id, 'k', 'r2', () => ({ subject: 'ok', html: 'ok' })), true);
  assert.equal(await sendOnce('00000000-0000-0000-0000-000000000000', 'k', 'r3', () => ({ subject: 'x', html: 'x' })), false);
});
