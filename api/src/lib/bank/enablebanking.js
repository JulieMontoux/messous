// Connecteur Enable Banking (agrégateur DSP2, gratuit pour un usage personnel)
// Doc : https://enablebanking.com/docs/api/reference/
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { isCardLabel, hashId } = require('./common');

const API = 'https://api.enablebanking.com';

function isConfigured() {
  return !!(process.env.ENABLE_BANKING_APP_ID && (process.env.ENABLE_BANKING_PRIVATE_KEY || process.env.ENABLE_BANKING_KEY_PATH));
}

function privateKey() {
  if (process.env.ENABLE_BANKING_PRIVATE_KEY) return process.env.ENABLE_BANKING_PRIVATE_KEY.replace(/\\n/g, '\n');
  return fs.readFileSync(process.env.ENABLE_BANKING_KEY_PATH, 'utf8');
}

function token() {
  const iat = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 },
    privateKey(),
    { algorithm: 'RS256', header: { typ: 'JWT', kid: process.env.ENABLE_BANKING_APP_ID } }
  );
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || `Enable Banking ${res.status}`);
  return data;
}

async function listBanks(country = 'FR') {
  const data = await call('GET', `/aspsps?country=${encodeURIComponent(country)}&psu_type=personal`);
  return (data.aspsps || []).map(a => ({ name: a.name, country: a.country, logo: a.logo }));
}

async function startAuth({ bankName, country = 'FR', state, redirectUrl }) {
  const validUntil = new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString();
  const data = await call('POST', '/auth', {
    access: { valid_until: validUntil },
    aspsp: { name: bankName, country },
    state,
    redirect_url: redirectUrl,
    psu_type: 'personal',
  });
  return { url: data.url };
}

async function createSession(code) {
  const data = await call('POST', '/sessions', { code });
  const accounts = (data.accounts || []).map(a => (typeof a === 'string'
    ? { uid: a, name: '', iban: '' }
    : { uid: a.uid, name: a.name || a.product || '', iban: a.account_id?.iban || '' }));
  return { sessionId: data.session_id, validUntil: data.access?.valid_until || null, accounts };
}

async function deleteSession(sessionId) {
  await call('DELETE', `/sessions/${sessionId}`).catch(() => {});
}

async function fetchBalance(uid) {
  const data = await call('GET', `/accounts/${uid}/balances`);
  const list = data.balances || [];
  const pick = list.find(b => ['ITAV', 'CLAV', 'XPCD'].includes(b.balance_type)) || list.find(b => b.balance_type === 'CLBD') || list[0];
  return pick ? Number(pick.balance_amount?.amount) : null;
}

function mapTransaction(t) {
  const amountAbs = Number(t.transaction_amount?.amount) || 0;
  const amount = t.credit_debit_indicator === 'DBIT' ? -Math.abs(amountAbs) : Math.abs(amountAbs);
  const label = [
    ...(t.remittance_information || []),
    t.credit_debit_indicator === 'CRDT' ? t.debtor?.name : t.creditor?.name,
  ].filter(Boolean).join(' ').trim() || t.bank_transaction_code?.description || '';
  const bookingDate = t.booking_date || t.transaction_date || t.value_date;
  const code = [t.bank_transaction_code?.code, t.bank_transaction_code?.sub_code, t.bank_transaction_code?.description].filter(Boolean).join(' ');
  return {
    externalId: `eb:${t.transaction_id || t.entry_reference || hashId(bookingDate, amount, label)}`,
    bookingDate,
    amount,
    label,
    isCard: isCardLabel(label, code),
  };
}

async function fetchTransactions(uid, dateFrom) {
  const out = [];
  let continuation = null;
  for (let page = 0; page < 20; page++) {
    const qs = new URLSearchParams({ date_from: dateFrom });
    if (continuation) qs.set('continuation_key', continuation);
    const data = await call('GET', `/accounts/${uid}/transactions?${qs}`);
    for (const t of data.transactions || []) {
      if (t.status && t.status !== 'BOOK' && t.status !== 'PDNG') continue;
      const m = mapTransaction(t);
      if (m.bookingDate) out.push(m);
    }
    continuation = data.continuation_key;
    if (!continuation) break;
  }
  return out;
}

module.exports = { isConfigured, listBanks, startAuth, createSession, deleteSession, fetchBalance, fetchTransactions, mapTransaction };
