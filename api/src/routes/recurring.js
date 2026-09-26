const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const toClient = r => ({
  id: r.id,
  envelopeId: r.envelope_id,
  amount: Number(r.amount),
  note: r.note,
  dayOfMonth: r.day_of_month,
  active: r.active,
  lastCreatedMonth: r.last_created_month,
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM recurring_transactions WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.userId]
    );
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { envelopeId, amount, note = '', dayOfMonth = 1 } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO recurring_transactions (user_id, envelope_id, amount, note, day_of_month)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.userId, envelopeId, amount, note, dayOfMonth]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { envelopeId, amount, note, dayOfMonth, active } = req.body;
    const { rows } = await pool.query(
      `UPDATE recurring_transactions
       SET envelope_id=$2, amount=$3, note=$4, day_of_month=$5, active=$6
       WHERE id=$1 AND user_id=$7 RETURNING *`,
      [req.params.id, envelopeId, amount, note, dayOfMonth, active, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM recurring_transactions WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
