const { test } = require('node:test');
const assert = require('node:assert');
const { keywordTarget, suggestTargets } = require('../src/lib/bank/suggest');

const envelopes = [
  { id: 'c', name: 'Courses', category_id: 'groceries' },
  { id: 'r', name: 'Restos', category_id: 'restaurant' },
  { id: 'p', name: 'Plaisirs', category_id: 'pleasure' },
];
const charges = [{ id: 'n', name: 'Abonnements', category_id: 'subscription' }];

test('marchands connus → enveloppe ou charge fixe', () => {
  assert.equal(keywordTarget('CB LIDL 2811', envelopes, charges), 'env:c');
  assert.equal(keywordTarget('CB UBER EATS PARIS', envelopes, charges), 'env:r');
  assert.equal(keywordTarget('PRLV NETFLIX.COM', envelopes, charges), 'fix:n');
  assert.equal(keywordTarget('AMAZON PRIME FR', envelopes, charges), 'fix:n');
  assert.equal(keywordTarget('CB AMAZON MKTP', envelopes, charges), 'env:p');
  assert.equal(keywordTarget('CB ESSO 1234', envelopes, charges), null, 'pas d\'enveloppe carburant → rien');
});

test('IA indisponible : les mots-clés suffisent et l\'erreur est signalée', async () => {
  process.env.OLLAMA_URL = 'http://127.0.0.1:9';
  const r = await suggestTargets(
    [{ id: '1', label: 'CB LIDL' }, { id: '2', label: 'CB CHEZ MARCEL' }],
    envelopes, charges
  );
  assert.deepEqual(r.suggestions, { 1: { target: 'env:c', source: 'keyword' } });
  assert.ok(r.aiError);
});

test('IA : la réponse JSON d\'Ollama est convertie en suggestions, une question par marchand', async () => {
  const http = require('http');
  let prompt = '';
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      prompt = JSON.parse(body).prompt;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ response: JSON.stringify({ 1: 'E2', 2: null }) }));
    });
  });
  await new Promise(r => server.listen(0, r));
  process.env.OLLAMA_URL = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await suggestTargets(
      [{ id: 'a', label: 'CB CHEZ MARCEL 0111' }, { id: 'b', label: 'CB CHEZ MARCEL 0211' }, { id: 'c', label: 'CB INCONNU' }],
      envelopes, charges
    );
    assert.deepEqual(r.suggestions, { a: { target: 'env:r', source: 'ai' }, b: { target: 'env:r', source: 'ai' } });
    assert.equal(r.aiError, null);
    assert.equal((prompt.match(/CHEZ MARCEL/g) || []).length, 1, 'un seul libellé par marchand');
  } finally {
    server.close();
  }
});
