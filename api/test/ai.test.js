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

// Avis sur la méthode de budget : le client envoie la comparaison calculée sur l'historique
const comparison = {
  months: ['2026-10', '2026-09'],
  perMonth: [{ month: '2026-10', needs: 400, wants: 300, savings: 100 }],
  best: '80-20',
  rules: [
    { id: '80-20', label: '80/20', score: 3.2, rows: [{ label: 'Épargne', pct: 0.2, actual: 500, ideal: 440 }] },
    { id: 'zero-based', label: 'Base zéro', score: null, toAssign: 120, rows: [{ label: 'Besoins', pct: null, actual: 400, ideal: null }] },
    { id: 'kakeibo', label: 'Kakeibo', score: null, rows: [] },
    { id: 'pirate', label: 'Inconnue', score: 0, rows: [] },
  ],
};

function jsonOllama(response, onBody = () => {}) {
  return fakeOllama((body, res) => { onBody(body); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ response })); });
}

test('méthode de budget : réponse JSON de l\'IA validée, prompt avec les chiffres réels', async () => {
  let sent;
  const server = await jsonOllama(JSON.stringify({ ruleId: 'kakeibo', includeFixed: false, reasons: ['Raison A', '', 42, 'Raison B'], tip: ' Commence petit ' }), b => { sent = b; });
  try {
    const u = await richUser();
    await u.post('/api/charges', { name: 'Prêt', amount: 1200, categoryId: 'loan', frequency: 'yearly', dueMonth: 2 });
    await u.post('/api/charges', { name: 'Ancien prêt', amount: 300, categoryId: 'loan', endMonth: '2020-01' });
    const r = (await u.post('/api/ai/budget-method', { comparison, currentRuleId: '50-30-20', includeFixed: true }).expect(200)).body;
    assert.deepEqual(r, { ruleId: 'kakeibo', includeFixed: false, reasons: ['Raison A', 'Raison B'], tip: 'Commence petit', fallback: false, months: comparison.months });
    assert.equal(sent.format, 'json');
    assert.match(sent.prompt, /Salaire net : 2500€/);
    assert.match(sent.prompt, /dont crédits 100€/);
    assert.match(sent.prompt, /80-20 \(80\/20\) — écart moyen 3.2 %/);
    assert.match(sent.prompt, /reste à affecter 120€/);
    assert.match(sent.prompt, /2026-10 : besoins 400€, envies 300€/);
    assert.doesNotMatch(sent.prompt, /pirate/);
  } finally {
    server.close();
  }
});

test('méthode de budget : réponse inutilisable → méthode la plus proche selon les chiffres', async () => {
  for (const response of ['pas du json', JSON.stringify({ ruleId: 'pirate', reasons: ['x'] }), JSON.stringify({ ruleId: 'sixty' })]) {
    const server = await jsonOllama(response);
    try {
      const u = await richUser();
      const r = (await u.post('/api/ai/budget-method', { comparison, includeFixed: true }).expect(200)).body;
      assert.equal(r.ruleId, '80-20');
      assert.equal(r.fallback, true);
      assert.equal(r.includeFixed, true);
      assert.equal(r.reasons.length, 1);
    } finally {
      server.close();
    }
  }
});

test('méthode de budget : sans historique → 400, profil absent → 400, Ollama en erreur → 502 (pas de nouvel essai)', async () => {
  const u = await newUser();
  await u.post('/api/ai/budget-method', {}).expect(400);
  await u.post('/api/ai/budget-method', { comparison: { months: [], rules: [] } }).expect(400);
  const { userId } = require('./helpers');
  await pool.query('DELETE FROM profiles WHERE user_id = $1', [await userId(u)]);
  await u.post('/api/ai/budget-method', { comparison }).expect(400);

  const server = await fakeOllama((body, res) => { res.statusCode = 500; res.end(); });
  try {
    const v = await richUser();
    assert.match((await v.post('/api/ai/budget-method', { comparison }).expect(502)).body.error, /Ollama 500/);
  } finally {
    server.close();
  }
});
