// Faux serveur pour les tests de composants : remplace fetch, garde les données en mémoire
// et répond comme l'API réelle. Chaque appel est enregistré dans `calls`.
import { vi } from 'vitest';
import { fixtures } from './fixtures';

let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

function jsonResponse(status, body) {
  return {
    ok: status < 400,
    status,
    json: async () => {
      if (body === undefined) throw new Error('pas de JSON');
      return JSON.parse(JSON.stringify(body));
    },
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    blob: async () => new Blob([typeof body === 'string' ? body : JSON.stringify(body)]),
    body: null,
  };
}

// Flux SSE simulé pour les astuces IA
function sseResponse(chunks) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => (i < chunks.length
          ? { done: false, value: encoder.encode(chunks[i++]) }
          : { done: true, value: undefined }),
      }),
    },
  };
}

export function installFakeApi(overrides = {}) {
  const db = fixtures(overrides);
  const calls = [];
  const handlers = [];
  const on = (method, pattern, fn) => handlers.push({ method, pattern, fn });

  // Profil & réglages
  on('GET', /^\/api\/profile$/, () => db.profile);
  on('PUT', /^\/api\/profile$/, b => Object.assign(db.profile, b));
  on('PUT', /^\/api\/profile\/salary$/, b => {
    if (b.from > db.today.slice(0, 7)) Object.assign(db.profile, { nextSalary: b.amount, nextSalaryFrom: b.from });
    else Object.assign(db.profile, { netSalary: b.amount, nextSalary: null, nextSalaryFrom: null });
    return db.profile;
  });
  on('DELETE', /^\/api\/profile\/salary\/pending$/, () => ({ ok: true }));
  on('PUT', /^\/api\/profile\/balance$/, b => Object.assign(db.profile, { manualBalance: b.balance, manualBalanceAt: b.balance == null ? null : 'x' }));
  on('POST', /^\/api\/profile\/test-email$/, () => (db.failTestEmail ? [400, { error: 'SMTP non configuré' }] : { ok: true, to: db.profile.accountEmail }));
  on('POST', /^\/api\/profile\/reset$/, b => (b.password === 'motdepasse1' ? { ok: true } : [403, { error: 'Mot de passe incorrect' }]));
  on('GET', /^\/api\/settings$/, () => db.settings);
  on('PUT', /^\/api\/settings$/, b => Object.assign(db.settings, { view_mode: b.viewMode }));

  // Charges, enveloppes, dépenses
  const crud = (name, path) => {
    on('GET', new RegExp(`^/api/${path}$`), () => db[name]);
    on('POST', new RegExp(`^/api/${path}$`), b => { const x = { id: b.id || newId(), ...b }; db[name].push(x); return x; });
    on('PUT', new RegExp(`^/api/${path}/([^/]+)$`), (b, [, id]) => {
      const x = db[name].find(e => e.id === id);
      return x ? Object.assign(x, b) : [404, { error: 'Not found' }];
    });
    on('DELETE', new RegExp(`^/api/${path}/([^/]+)$`), (b, [, id]) => { db[name] = db[name].filter(e => e.id !== id); return { ok: true }; });
  };
  on('GET', /^\/api\/envelopes\/carryovers$/, () => db.carryovers);
  crud('fixedCharges', 'charges');
  crud('envelopes', 'envelopes');
  crud('transactions', 'transactions');
  crud('withdrawals', 'withdrawals');
  crud('recurring', 'recurring');

  // Historique
  on('GET', /^\/api\/savings$/, () => db.savingsHistory);
  on('PUT', /^\/api\/savings\/(\d{4}-\d{2})\/close$/, (b, [, month]) => {
    const snap = db.savingsHistory.find(s => s.month === month) || { month };
    Object.assign(snap, b, { closedAt: 'x' });
    if (!db.savingsHistory.includes(snap)) db.savingsHistory.push(snap);
    return snap;
  });
  on('PUT', /^\/api\/savings\/(\d{4}-\d{2})$/, (b, [, month]) => ({ month, ...b }));

  // Objectifs & avances
  on('GET', /^\/api\/goals$/, () => db.goals);
  on('POST', /^\/api\/goals$/, b => { const g = { id: newId(), currentAmount: 0, ...b }; db.goals.push(g); return g; });
  on('PUT', /^\/api\/goals\/([^/]+)$/, (b, [, id]) => Object.assign(db.goals.find(g => g.id === id), b));
  on('PATCH', /^\/api\/goals\/([^/]+)\/deposit$/, (b, [, id]) => {
    const g = db.goals.find(x => x.id === id);
    g.currentAmount += b.amount;
    return g;
  });
  on('DELETE', /^\/api\/goals\/([^/]+)$/, (b, [, id]) => { db.goals = db.goals.filter(g => g.id !== id); return { ok: true }; });
  on('GET', /^\/api\/advances$/, () => db.advances);
  on('POST', /^\/api\/advances$/, b => { const a = { id: newId(), repaidAt: null, bankTransactionId: null, ...b }; db.advances.unshift(a); return a; });
  on('PUT', /^\/api\/advances\/([^/]+)\/repaid$/, (b, [, id]) => Object.assign(db.advances.find(a => a.id === id), { repaidAt: b.repaid ? db.today : null }));
  on('DELETE', /^\/api\/advances\/([^/]+)$/, (b, [, id]) => { db.advances = db.advances.filter(a => a.id !== id); return { ok: true }; });

  // Banque
  on('GET', /^\/api\/bank\/status$/, () => (db.statusError ? [500, { error: db.statusError }] : db.bankStatus));
  on('GET', /^\/api\/bank\/transactions/, () => (db.opsError ? [500, { error: db.opsError }] : db.bankTransactions));
  on('GET', /^\/api\/bank\/banks$/, () => (db.banksError ? [502, { error: db.banksError }] : db.banks));
  on('POST', /^\/api\/bank\/connect$/, () => (db.connectError ? [502, { error: db.connectError }] : { url: 'about:blank#banque' }));
  on('POST', /^\/api\/bank\/sync$/, () => (db.syncError ? [502, { error: db.syncError }] : { inserted: 2, assigned: 1, withdrawals: 1 }));
  on('POST', /^\/api\/bank\/import$/, () => (db.importError ? [400, { error: db.importError }] : { parsed: 3, inserted: 2, assigned: 0, withdrawals: 1, skipped: 1, from: '2026-10-01' }));
  on('POST', /^\/api\/bank\/suggest$/, () => db.suggestions);
  on('POST', /^\/api\/bank\/transactions\/bulk$/, b => {
    if (db.bulkError) return [500, { error: db.bulkError }];
    for (const id of b.ids) {
      const t = db.bankTransactions.find(x => x.id === id);
      if (b.ignore) t.ignored = true;
      if (b.envelopeId) t.envelopeId = b.envelopeId;
      if (b.fixedChargeId) t.fixedChargeId = b.fixedChargeId;
      if (b.asWithdrawal) t.withdrawalId = newId();
    }
    return { updated: b.ids.length };
  });
  on('POST', /^\/api\/bank\/transactions\/([^/]+)\/assign$/, (b, [, id]) => {
    if (db.assignError) return [400, { error: db.assignError }];
    const t = db.bankTransactions.find(x => x.id === id);
    if (b.advance) { t.advanceId = newId(); t.advancePerson = b.advance.person; return { transaction: null }; }
    if (b.asWithdrawal) { t.withdrawalId = newId(); return { transaction: null }; }
    if (b.fixedChargeId) { t.fixedChargeId = b.fixedChargeId; return { transaction: null }; }
    const tx = { id: newId(), envelopeId: b.envelopeId, amount: -t.amount, note: t.label, date: t.date, paymentMethod: 'card', bankTransactionId: id };
    db.transactions.push(tx);
    Object.assign(t, { envelopeId: b.envelopeId, transactionId: tx.id });
    return { transaction: tx };
  });
  on('POST', /^\/api\/bank\/transactions\/([^/]+)\/unassign$/, (b, [, id]) => {
    const t = db.bankTransactions.find(x => x.id === id);
    Object.assign(t, { envelopeId: null, fixedChargeId: null, withdrawalId: null, advanceId: null, transactionId: null });
    return { ok: true };
  });
  on('POST', /^\/api\/bank\/transactions\/([^/]+)\/ignore$/, (b, [, id]) => {
    Object.assign(db.bankTransactions.find(x => x.id === id), { ignored: b.ignored, withdrawalId: null });
    return { ok: true };
  });
  on('DELETE', /^\/api\/bank\/connections\/([^/]+)$/, () => ({ ok: true }));
  on('DELETE', /^\/api\/bank\/rules\/([^/]+)$/, (b, [, id]) => { db.bankStatus.rules = db.bankStatus.rules.filter(r => r.id !== id); return { ok: true }; });

  // Divers
  on('GET', /^\/api\/ai\/history$/, () => db.aiHistory);
  on('POST', /^\/api\/ai\/suggestions$/, () => (db.aiError
    ? [503, { error: db.aiError }]
    : sseResponse([
      `data: ${JSON.stringify({ token: '1. Réduis ' })}\n\n`,
      `data: ${JSON.stringify({ token: 'les restos.' })}\n\ndata: ${JSON.stringify({ done: true })}\n\n`,
    ])));
  on('GET', /^\/api\/push\/public-key$/, () => ({ publicKey: 'BAAA' }));
  on('POST', /^\/api\/push\/(subscribe|unsubscribe|test)$/, () => ({ ok: true, sent: 1 }));
  on('GET', /^\/api\/export\/(\w+)\.csv$/, () => (db.exportError ? [500, { error: 'panne' }] : 'Date;Montant\n'));
  on('POST', /^\/api\/auth\/login$/, b => (b.password === 'motdepasse1' ? { token: 'jeton', user: { email: b.email } } : [401, { error: 'Email ou mot de passe incorrect' }]));
  on('POST', /^\/api\/auth\/register$/, b => (db.registerError ? [409, { error: db.registerError }] : { token: 'jeton', user: { email: b.email } }));
  on('GET', /^\/version\.json/, () => ({ version: db.serverVersion || 'dev' }));

  const fetchMock = vi.fn(async (url, opts = {}) => {
    const method = opts.method || 'GET';
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ method, path, body });
    if (db.down && path.startsWith('/api/')) return jsonResponse(502, undefined);
    const h = handlers.find(x => x.method === method && x.pattern.test(path.split('?')[0]));
    if (!h) return jsonResponse(404, { error: `non simulé : ${method} ${path}` });
    const out = h.fn(body, path.split('?')[0].match(h.pattern));
    if (out && out.body && out.ok !== undefined) return out; // flux SSE
    if (Array.isArray(out) && typeof out[0] === 'number') return jsonResponse(out[0], out[1]);
    return jsonResponse(200, out);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { db, calls, fetch: fetchMock, called: (method, re) => calls.filter(c => c.method === method && re.test(c.path)) };
}
