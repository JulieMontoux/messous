const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const toClient = r => ({
  id: r.id,
  envelopeId: r.envelope_id,
  amount: Number(r.amount),
  note: r.note,
  date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
});

function isUUID(s) {
  return s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function createDueRecurring(userId) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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
      `INSERT INTO transactions (user_id, envelope_id, amount, note, date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [userId, t.envelope_id, t.amount, t.note || `↩ ${t.note || 'Récurrent'}`, date]
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
    const { id, envelopeId, amount, note, date } = req.body;
    // Si envelopeId n'est pas un UUID valide, on ignore la transaction (ancien format)
    if (!isUUID(envelopeId)) return res.json({ skipped: true });
    const { rows } = await pool.query(
      'INSERT INTO transactions (id, user_id, envelope_id, amount, note, date) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6) RETURNING *',
      [isUUID(id) ? id : null, req.user.userId, envelopeId, amount, note || '', date]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.json({ ok: true });
    await pool.query('DELETE FROM transactions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
