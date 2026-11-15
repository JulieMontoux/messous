const { test, after, mock } = require('node:test');
const assert = require('node:assert');
const { pool, setup } = require('./helpers');
const scheduler = require('../src/lib/scheduler');

after(() => pool.end());

test('tick : enchaîne toutes les tâches sans planter si l\'une échoue', async () => {
  await setup();
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  const query = mock.method(pool, 'query', async () => { throw new Error('base indisponible'); });
  try {
    await scheduler.tick();
  } finally {
    query.mock.restore();
    console.error = orig;
  }
  assert.ok(errors.some(e => e.includes('[scheduler] month-end') || e.includes('[scheduler] monthly report') || e.includes('[scheduler] bank')));
});

test('démarrage : une première passe après 30 s, puis toutes les 15 min', () => {
  mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const timeouts = mock.method(global, 'setTimeout');
  const intervals = mock.method(global, 'setInterval');
  try {
    scheduler.startScheduler();
    assert.equal(timeouts.mock.calls[0].arguments[1], 30_000);
    assert.equal(intervals.mock.calls[0].arguments[1], 15 * 60 * 1000);
  } finally {
    timeouts.mock.restore();
    intervals.mock.restore();
    mock.timers.reset();
  }
});
