const { pool } = require('../../db');
const eb = require('./enablebanking');
const { merchantKey } = require('./common');
const { checkEnvelopeAlert } = require('../alerts');
const { localDate, bankHistoryStart } = require('../dates');

// Insère les opérations (dédoublonnées), puis applique les règles d'affectation automatique
async function storeTransactions(userId, accountId, txs) {
  const newIds = [];
  for (const t of txs) {
    const { rows } = await pool.query(
      `INSERT INTO bank_transactions (user_id, account_id, external_id, booking_date, amount, label, is_card)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (user_id, external_id) DO NOTHING RETURNING id`,
      [userId, accountId, t.externalId, t.bookingDate, t.amount, String(t.label).slice(0, 500), t.isCard]
    );
    if (rows.length) newIds.push(rows[0].id);
  }
  // Règles appliquées aux seules nouvelles opérations : un classement retiré à la main reste retiré
  const assigned = await applyRules(userId, newIds);
  return { inserted: newIds.length, assigned };
}

async function assignBankTransaction(userId, bankTxId, envelopeId) {
  const { rows: [btx] } = await pool.query(
    'SELECT * FROM bank_transactions WHERE id = $1 AND user_id = $2', [bankTxId, userId]
  );
  if (!btx) throw Object.assign(new Error('Opération introuvable'), { status: 404 });
  if (btx.transaction_id) await pool.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [btx.transaction_id, userId]);

  const { rows: [tx] } = await pool.query(
    `INSERT INTO transactions (user_id, envelope_id, amount, note, date, payment_method, bank_transaction_id)
     VALUES ($1, $2, $3, $4, $5, 'card', $6) RETURNING *`,
    [userId, envelopeId, Math.abs(Number(btx.amount)), cleanLabel(btx.label), btx.booking_date, btx.id]
  );
  await pool.query(
    'UPDATE bank_transactions SET envelope_id = $2, transaction_id = $3, fixed_charge_id = NULL, ignored = false WHERE id = $1',
    [btx.id, envelopeId, tx.id]
  );
  checkEnvelopeAlert(userId, envelopeId).catch(err => console.error('[alert]', err.message));
  return tx;
}

// Note lisible pour la dépense : nom du marchand (« Carrefour City ») ou libellé brut à défaut
// Rattache une opération à une charge fixe : pas de dépense d'enveloppe créée (la charge est déjà au budget)
async function assignToFixedCharge(userId, bankTxId, fixedChargeId) {
  const { rows: [btx] } = await pool.query(
    'SELECT * FROM bank_transactions WHERE id = $1 AND user_id = $2', [bankTxId, userId]
  );
  if (!btx) throw Object.assign(new Error('Opération introuvable'), { status: 404 });
  if (btx.transaction_id) await pool.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [btx.transaction_id, userId]);
  await pool.query(
    'UPDATE bank_transactions SET fixed_charge_id = $2, envelope_id = NULL, transaction_id = NULL, ignored = false WHERE id = $1',
    [btx.id, fixedChargeId]
  );
}

function cleanLabel(label) {
  const key = merchantKey(label);
  if (key) return key.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return String(label || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

async function applyRules(userId, ids) {
  if (!ids.length) return 0;
  const { rows: rules } = await pool.query('SELECT * FROM bank_rules WHERE user_id = $1', [userId]);
  if (!rules.length) return 0;
  const { rows: pending } = await pool.query(
    `SELECT id, label FROM bank_transactions
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND envelope_id IS NULL AND fixed_charge_id IS NULL
       AND ignored = false AND amount < 0`,
    [userId, ids]
  );
  let count = 0;
  for (const btx of pending) {
    const key = merchantKey(btx.label);
    const rule = rules.find(r => key && (key === r.pattern || key.startsWith(r.pattern)));
    if (rule) {
      if (rule.fixed_charge_id) await assignToFixedCharge(userId, btx.id, rule.fixed_charge_id);
      else await assignBankTransaction(userId, btx.id, rule.envelope_id);
      count++;
    }
  }
  return count;
}

async function syncConnection(conn) {
  if (conn.provider !== 'enablebanking' || conn.status !== 'active') return { inserted: 0, assigned: 0 };
  if (conn.valid_until && new Date(conn.valid_until) < new Date()) {
    await pool.query("UPDATE bank_connections SET status = 'expired' WHERE id = $1", [conn.id]);
    return { inserted: 0, assigned: 0 };
  }
  const { rows: accounts } = await pool.query('SELECT * FROM bank_accounts WHERE connection_id = $1', [conn.id]);
  // 1re synchro : depuis le 1er du mois dernier ; ensuite les 10 derniers jours (sans remonter avant)
  const since = new Date();
  since.setDate(since.getDate() - 10);
  const sinceStr = conn.last_sync_at && localDate(since) > bankHistoryStart() ? localDate(since) : bankHistoryStart();
  let inserted = 0;
  let assigned = 0;
  try {
    for (const acc of accounts) {
      const txs = await eb.fetchTransactions(acc.external_uid, sinceStr);
      const r = await storeTransactions(conn.user_id, acc.id, txs);
      inserted += r.inserted;
      assigned += r.assigned;
      const balance = await eb.fetchBalance(acc.external_uid).catch(() => null);
      if (balance != null) await pool.query('UPDATE bank_accounts SET balance = $2, balance_at = NOW() WHERE id = $1', [acc.id, balance]);
    }
    await pool.query('UPDATE bank_connections SET last_sync_at = NOW(), last_error = NULL WHERE id = $1', [conn.id]);
  } catch (err) {
    await pool.query('UPDATE bank_connections SET last_error = $2 WHERE id = $1', [conn.id, err.message]);
    throw err;
  }
  return { inserted, assigned };
}

async function syncUser(userId) {
  const { rows } = await pool.query("SELECT * FROM bank_connections WHERE user_id = $1 AND status = 'active'", [userId]);
  const total = { inserted: 0, assigned: 0 };
  for (const conn of rows) {
    const r = await syncConnection(conn);
    total.inserted += r.inserted;
    total.assigned += r.assigned;
  }
  return total;
}

module.exports = { storeTransactions, assignBankTransaction, assignToFixedCharge, applyRules, syncConnection, syncUser, cleanLabel };
