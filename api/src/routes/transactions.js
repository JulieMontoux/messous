const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');
const { checkEnvelopeAlert } = require('../lib/alerts');
const { localDate, monthKey } = require('../lib/dates');

router.use(auth);

const toClient = r => ({
  id: r.id,
  envelopeId: r.envelope_id,
  amount: Number(r.amount),
  note: r.note,
  date: String(r.date).slice(0, 10),
  paymentMethod: r.payment_method || 'cash',
  bankTransactionId: r.bank_transaction_id || null,
});

function isUUID(s) {
  return s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function createDueRecurring(userId) {
  const now = new Date();
  const currentMonth = monthKey(now);
  const today = now.getDate();

  const { rows: templates } = await pool.query(
    `SELECT * FROM recurring_transactions
     WHERE user_id = $1 AND active = true
       AND (last_created_month IS NULL OR last_created_month < $2)
       AND day_of_month <= $3`,
    [userId, currentMonth, today]
  );

  for (const t of templates) {
    const date = `${currentMonth}-${String(t.day_of_month).padStart(2, '0')}`;
    await pool.query(
      `INSERT INTO transactions (user_id, envelope_id, amount, note, date, payment_method)
       VALUES ($1, $2, $3, $4, $5, 'card')`,
      [userId, t.envelope_id, t.amount, t.note ? `↩ ${t.note}` : '↩ Récurrent', date]
    );
    await pool.query(
      'UPDATE recurring_transactions SET last_created_month=$2 WHERE id=$1',
      [t.id, currentMonth]
    );
  }
}

router.get('/', async (req, res) => {
  try {
    await createDueRecurring(req.user.userId).catch(() => {});
    const { rows } = await pool.query(
      'SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC, created_at DESC',
      [req.user.userId]
    );
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { id, envelopeId, amount, note, date, paymentMethod } = req.body;
    // Si envelopeId n'est pas un UUID valide, on ignore la transaction (ancien format)
    if (!isUUID(envelopeId)) return res.json({ skipped: true });
    const { rows } = await pool.query(
      'INSERT INTO transactions (id, user_id, envelope_id, amount, note, date, payment_method) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7) RETURNING *',
      [isUUID(id) ? id : null, req.user.userId, envelopeId, amount, note || '', date || localDate(), paymentMethod === 'card' ? 'card' : 'cash']
    );
    res.json(toClient(rows[0]));
    checkEnvelopeAlert(req.user.userId, envelopeId).catch(err => console.error('[alert]', err.message));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.json({ ok: true });
    await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    // Une opération bancaire liée redevient « à classer »
    await pool.query('UPDATE bank_transactions SET envelope_id = NULL WHERE transaction_id IS NULL AND envelope_id IS NOT NULL AND user_id = $1', [req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
