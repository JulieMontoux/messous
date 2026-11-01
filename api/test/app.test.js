const { test } = require('node:test');
const assert = require('node:assert');

// Chargé hors mode test, avec une origine CORS : vérifie la configuration de l'application
process.env.CORS_ORIGIN = 'https://a.example,https://b.example';
process.env.NODE_ENV = 'production';
const request = require('supertest');
const app = require('../src/app');

test('CORS : seules les origines configurées sont autorisées', async () => {
  const ok = await request(app).get('/api/health').set('Origin', 'https://b.example').expect(200);
  assert.equal(ok.headers['access-control-allow-origin'], 'https://b.example');
  const ko = await request(app).get('/api/health').set('Origin', 'https://pirate.example').expect(200);
  assert.equal(ko.headers['access-control-allow-origin'], undefined);
});

test('journal des requêtes (hors /api/health) en production', async () => {
  const logs = [];
  const orig = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    await request(app).get('/api/health');
    await request(app).get('/api/profile');
    await new Promise(r => setTimeout(r, 20));
  } finally {
    console.log = orig;
  }
  assert.equal(logs.length, 1);
  assert.match(logs[0], /GET \/api\/profile → 401/);
});
