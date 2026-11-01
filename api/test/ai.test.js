const { test, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { pool, newUser } = require('./helpers');

after(() => pool.end());

// Faux Ollama : renvoie la réponse en flux NDJSON, comme le vrai
function fakeOllama(handler) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => handler(JSON.parse(body), res));
  });
  return new Promise(r => server.listen(0, () => {
    process.env.OLLAMA_URL = `http://127.0.0.1:${server.address().port}`;
    r(server);
  }));
}

async function richUser() {
  const u = await newUser();
  await u.put('/api/profile', { firstName: 'Julie', netSalary: 2500, isSmoker: true, onboardingDone: true });
  await u.post('/api/charges', { name: 'Loyer', amount: 700 });
  await u.post('/api/charges', { name: 'Assurance', amount: 120, frequency: 'yearly', dueMonth: 3 });
  const c = (await u.post('/api/envelopes', { name: 'Courses', categoryId: 'groceries', type: 'need', budgetMonthly: 300 })).body;
  const r = (await u.post('/api/envelopes', { name: 'Restos', categoryId: 'restaurant', type: 'want', budgetMonthly: 100 })).body;
  await u.post('/api/envelopes', { name: 'Livret', categoryId: 'livret', type: 'saving', budgetMonthly: 100 });
  const today = new Date().toISOString().slice(0, 10);
  await u.post('/api/transactions', { envelopeId: c.id, amount: 250, date: today });
  await u.post('/api/transactions', { envelopeId: r.id, amount: 130, date: today });
  // Historique sur plusieurs mois pour les tendances
  const d = new Date();
  for (let i = 1; i <= 3; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 10).toISOString().slice(0, 10);
    await u.post('/api/transactions', { envelopeId: c.id, amount: 100 * i, date: m });
  }
  await u.put(`/api/savings/${today.slice(0, 7)}`, { salary: 2500, totalFixed: 710, totalEnvelopes: 500, programmedSavings: 0, savingEnvelopes: 100, remainder: 1290, totalSavings: 1390, recordedAt: new Date().toISOString() });
  return u;
}

test('astuces IA : flux SSE, prompt complet, analyse sauvegardée dans l\'historique', async () => {
  let prompt = '';
  const server = await fakeOllama((body, res) => {
    prompt = body.prompt;
    res.write(JSON.stringify({ response: '1. Réduis ' }) + '\n');
    res.write('ligne invalide\n');
    res.write(JSON.stringify({ response: 'les restos.' }) + '\n');
    res.end(JSON.stringify({ done: true }) + '\n');
  });
  try {
    const u = await richUser();
    const r = await u.post('/api/ai/suggestions').buffer(true).parse((res, cb) => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => cb(null, text));
    }).expect(200);
    assert.match(r.headers['content-type'], /text\/event-stream/);
    assert.match(r.body, /"token":"1\. Réduis "/);
    assert.match(r.body, /"done":true/);
    assert.match(prompt, /Salaire net: 2500€/);
    assert.match(prompt, /Fumeur: oui/);
    assert.match(prompt, /Assurance: 120€ par an/);
    assert.match(prompt, /Restos: 130€\/100€ ⚠️ dépassement/);
    assert.match(prompt, /Courses: 250€\/300€ ⚡ 83% utilisé/);
    assert.match(prompt, /TENDANCES/);
    const history = (await u.get('/api/ai/history').expect(200)).body;
    assert.equal(history[0].content, '1. Réduis les restos.');
  } finally {
    server.close();
  }
});

test('astuces IA : Ollama en erreur ou injoignable → 503', async () => {
  const server = await fakeOllama((body, res) => { res.statusCode = 500; res.end(); });
  try {
    const u = await newUser();
    assert.match((await u.post('/api/ai/suggestions').expect(503)).body.error, /Ollama 500/);
  } finally {
    server.close();
  }
  process.env.OLLAMA_URL = 'http://127.0.0.1:9';
  const u = await newUser();
  await u.post('/api/ai/suggestions').expect(503);
});

test('astuces IA : erreur pendant le flux transmise au navigateur', async () => {
  const server = await fakeOllama((body, res) => {
    res.write(JSON.stringify({ response: 'début' }) + '\n');
    setTimeout(() => res.destroy(), 50);
  });
  try {
    const u = await newUser();
    const r = await u.post('/api/ai/suggestions').buffer(true).parse((res, cb) => {
      let text = '';
      res.on('data', c => { text += c; });
      res.on('end', () => cb(null, text));
    });
    assert.match(r.body, /début/);
  } finally {
    server.close();
  }
});
