const router = require('express').Router();
const crypto = require('crypto');
const { pool } = require('../db');
const auth = require('../middleware/auth');
const eb = require('../lib/bank/enablebanking');
const { parseBankCsv } = require('../lib/bank/csv');
const { merchantKey } = require('../lib/bank/common');
const { storeTransactions, assignBankTransaction, assignToFixedCharge, syncUser, syncConnection } = require('../lib/bank/sync');
const { appUrl } = require('../lib/mailer');
const { checkEnvelopeAlert } = require('../lib/alerts');
const { bankHistoryStart } = require('../lib/dates');

const txToClient = r => ({
  id: r.id,
  accountId: r.account_id,
  date: r.booking_date,
  amount: Number(r.amount),
  label: r.label,
  isCard: r.is_card,
  envelopeId: r.envelope_id,
  fixedChargeId: r.fixed_charge_id || null,
  transactionId: r.transaction_id,
  ignored: r.ignored,
});

// Retour de la banque après consentement (navigateur, non authentifié : l'utilisateur est retrouvé via `state`)
router.get('/callback', async (req, res) => {
  const { state, code, error } = req.query;
  const back = status => res.redirect(appUrl(`/?page=bank&bank=${status}`));
  try {
    if (!state) return back('error');
    const { rows: [conn] } = await pool.query("SELECT * FROM bank_connections WHERE state = $1 AND status = 'pending'", [state]);
    if (!conn) return back('error');
    if (error || !code) {
      await pool.query("UPDATE bank_connections SET status = 'error', last_error = $2 WHERE id = $1", [conn.id, String(error || 'refusé')]);
      return back('error');
    }
    const session = await eb.createSession(String(code));
    await pool.query(
      "UPDATE bank_connections SET status = 'active', session_id = $2, valid_until = $3, state = NULL WHERE id = $1",
      [conn.id, session.sessionId, session.validUntil]
    );
    for (const a of session.accounts) {
      await pool.query(
        `INSERT INTO bank_accounts (user_id, connection_id, external_uid, name, iban) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, external_uid) DO UPDATE SET connection_id = EXCLUDED.connection_id, name = EXCLUDED.name, iban = EXCLUDED.iban`,
        [conn.user_id, conn.id, a.uid, a.name, a.iban]
      );
    }
    const { rows: [fresh] } = await pool.query('SELECT * FROM bank_connections WHERE id = $1', [conn.id]);
    await syncConnection(fresh).catch(err => console.error('[bank] first sync', err.message));
    back('ok');
  } catch (err) {
    console.error('[bank callback]', err.message);
    back('error');
  }
});

router.use(auth);

router.get('/status', async (req, res) => {
  try {
    const userId = req.user.userId;
    const [conns, accounts, rules] = await Promise.all([
      pool.query('SELECT id, provider, bank_name, status, valid_until, last_sync_at, last_error FROM bank_connections WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT id, connection_id, name, iban, balance, balance_at FROM bank_accounts WHERE user_id = $1 ORDER BY name', [userId]),
      pool.query('SELECT r.id, r.pattern, r.envelope_id, r.fixed_charge_id FROM bank_rules r WHERE r.user_id = $1 ORDER BY r.pattern', [userId]),
    ]);
    res.json({
      providerConfigured: eb.isConfigured(),
      connections: conns.rows.map(c => ({
        id: c.id, provider: c.provider, bankName: c.bank_name, status: c.status,
        validUntil: c.valid_until, lastSyncAt: c.last_sync_at, lastError: c.last_error,
      })),
      accounts: accounts.rows.map(a => ({
        id: a.id, connectionId: a.connection_id, name: a.name, iban: a.iban,
        balance: a.balance != null ? Number(a.balance) : null, balanceAt: a.balance_at,
      })),
      rules: rules.rows.map(r => ({ id: r.id, pattern: r.pattern, envelopeId: r.envelope_id, fixedChargeId: r.fixed_charge_id })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/banks', async (req, res) => {
  try {
    if (!eb.isConfigured()) return res.status(400).json({ error: 'Connecteur bancaire non configuré sur le serveur' });
    res.json(await eb.listBanks(req.query.country || 'FR'));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

router.post('/connect', async (req, res) => {
  try {
    if (!eb.isConfigured()) return res.status(400).json({ error: 'Connecteur bancaire non configuré sur le serveur' });
    const { bankName, country = 'FR' } = req.body;
    if (!bankName) return res.status(400).json({ error: 'Banque requise' });
    const state = crypto.randomBytes(24).toString('hex');
    await pool.query(
      "INSERT INTO bank_connections (user_id, provider, bank_name, state, status) VALUES ($1, 'enablebanking', $2, $3, 'pending')",
      [req.user.userId, bankName, state]
    );
    const { url } = await eb.startAuth({ bankName, country, state, redirectUrl: appUrl('/api/bank/callback') });
    res.json({ url });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

router.delete('/connections/:id', async (req, res) => {
  try {
    const { rows: [conn] } = await pool.query('SELECT * FROM bank_connections WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    if (!conn) return res.status(404).json({ error: 'Not found' });
    if (conn.session_id) await eb.deleteSession(conn.session_id);
    await pool.query('DELETE FROM bank_connections WHERE id = $1', [conn.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/sync', async (req, res) => {
  try {
    res.json(await syncUser(req.user.userId));
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// Import d'un relevé CSV (toutes banques) — alternative au connecteur DSP2
router.post('/import', async (req, res) => {
  try {
    const { csv, accountName = 'Import CSV' } = req.body;
    // Seulement les opérations depuis le 1er du mois dernier
    const all = parseBankCsv(csv);
    const from = bankHistoryStart();
    const txs = all.filter(t => t.bookingDate >= from);
    const { rows: [acc] } = await pool.query(
      `INSERT INTO bank_accounts (user_id, external_uid, name) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, external_uid) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [req.user.userId, `csv:${accountName}`, accountName]
    );
    const r = await storeTransactions(req.user.userId, acc.id, txs);
    res.json({ parsed: all.length, skipped: all.length - txs.length, from, ...r });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.get('/transactions', async (req, res) => {
  try {
    const from = req.query.from || bankHistoryStart();
    const { rows } = await pool.query(
      'SELECT * FROM bank_transactions WHERE user_id = $1 AND booking_date >= $2 ORDER BY booking_date DESC, created_at DESC',
      [req.user.userId, from]
    );
    res.json(rows.map(txToClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/transactions/:id/assign', async (req, res) => {
  try {
    const { envelopeId = null, fixedChargeId = null, remember = false } = req.body;
    const userId = req.user.userId;
    let tx = null;
    if (fixedChargeId) {
      const { rows: [fc] } = await pool.query('SELECT id FROM fixed_charges WHERE id = $1 AND user_id = $2', [fixedChargeId, userId]);
      if (!fc) return res.status(400).json({ error: 'Charge fixe introuvable' });
      await assignToFixedCharge(userId, req.params.id, fixedChargeId);
    } else {
      const { rows: [env] } = await pool.query('SELECT id FROM envelopes WHERE id = $1 AND user_id = $2', [envelopeId, userId]);
      if (!env) return res.status(400).json({ error: 'Enveloppe introuvable' });
      tx = await assignBankTransaction(userId, req.params.id, envelopeId);
    }
    if (remember) {
      const { rows: [btx] } = await pool.query('SELECT label FROM bank_transactions WHERE id = $1', [req.params.id]);
      const pattern = merchantKey(btx.label);
      if (pattern) {
        await pool.query(
          `INSERT INTO bank_rules (user_id, pattern, envelope_id, fixed_charge_id) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, pattern) DO UPDATE SET envelope_id = EXCLUDED.envelope_id, fixed_charge_id = EXCLUDED.fixed_charge_id`,
          [userId, pattern, fixedChargeId ? null : envelopeId, fixedChargeId]
        );
      }
    }
    res.json({
      transaction: tx && {
        id: tx.id, envelopeId: tx.envelope_id, amount: Number(tx.amount), note: tx.note,
        date: tx.date, paymentMethod: tx.payment_method, bankTransactionId: tx.bank_transaction_id,
      },
    });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// Classement en masse : { ids, envelopeId | fixedChargeId | ignore, remember }
router.post('/transactions/bulk', async (req, res) => {
  try {
    const { ids = [], envelopeId = null, fixedChargeId = null, ignore = false, remember = false } = req.body;
    const userId = req.user.userId;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Aucune opération sélectionnée' });
    if (!ignore && !envelopeId && !fixedChargeId) return res.status(400).json({ error: 'Destination requise' });
    if (fixedChargeId) {
      const { rows } = await pool.query('SELECT id FROM fixed_charges WHERE id = $1 AND user_id = $2', [fixedChargeId, userId]);
      if (!rows.length) return res.status(400).json({ error: 'Charge fixe introuvable' });
    } else if (envelopeId) {
      const { rows } = await pool.query('SELECT id FROM envelopes WHERE id = $1 AND user_id = $2', [envelopeId, userId]);
      if (!rows.length) return res.status(400).json({ error: 'Enveloppe introuvable' });
    }
    const { rows: btxs } = await pool.query(
      'SELECT id, label, transaction_id, booking_date FROM bank_transactions WHERE user_id = $1 AND id = ANY($2::uuid[]) AND amount < 0',
      [userId, ids]
    );
    for (const b of btxs) {
      if (ignore) {
        if (b.transaction_id) await pool.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [b.transaction_id, userId]);
        await pool.query(
          'UPDATE bank_transactions SET ignored = true, envelope_id = NULL, fixed_charge_id = NULL, transaction_id = NULL WHERE id = $1',
          [b.id]
        );
      } else if (fixedChargeId) {
        await assignToFixedCharge(userId, b.id, fixedChargeId);
      } else {
        await assignBankTransaction(userId, b.id, envelopeId, { alert: false });
      }
    }
    // Une seule vérification d'alerte, et seulement si la sélection contient une dépense du mois en cours
    if (envelopeId && !ignore) {
      const latest = btxs.map(b => b.booking_date).sort().pop();
      checkEnvelopeAlert(userId, envelopeId, latest).catch(err => console.error('[alert]', err.message));
    }
    if (remember && !ignore) {
      const patterns = [...new Set(btxs.map(b => merchantKey(b.label)).filter(Boolean))];
      for (const pattern of patterns) {
        await pool.query(
          `INSERT INTO bank_rules (user_id, pattern, envelope_id, fixed_charge_id) VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, pattern) DO UPDATE SET envelope_id = EXCLUDED.envelope_id, fixed_charge_id = EXCLUDED.fixed_charge_id`,
          [userId, pattern, fixedChargeId ? null : envelopeId, fixedChargeId]
        );
      }
    }
    res.json({ updated: btxs.length });
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

router.post('/transactions/:id/unassign', async (req, res) => {
  try {
    const { rows: [btx] } = await pool.query('SELECT * FROM bank_transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    if (!btx) return res.status(404).json({ error: 'Not found' });
    if (btx.transaction_id) await pool.query('DELETE FROM transactions WHERE id = $1 AND user_id = $2', [btx.transaction_id, req.user.userId]);
    await pool.query('UPDATE bank_transactions SET envelope_id = NULL, transaction_id = NULL, fixed_charge_id = NULL WHERE id = $1', [btx.id]);
    res.json({ ok: true, removedTransactionId: btx.transaction_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/transactions/:id/ignore', async (req, res) => {
  try {
    const { ignored = true } = req.body;
    await pool.query('UPDATE bank_transactions SET ignored = $3 WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId, !!ignored]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/rules/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM bank_rules WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
