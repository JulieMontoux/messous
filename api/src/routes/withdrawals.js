const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const toClient = r => ({
  id: r.id,
  date: r.date,
  amount: Number(r.amount),
  suggestedAmount: r.suggested_amount != null ? Number(r.suggested_amount) : null,
  mode: r.mode,
  note: r.note,
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY date DESC, created_at DESC',
      [req.user.userId]
    );
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { id, date, amount, suggestedAmount = null, mode = 'weekly', note = '' } = req.body;
    if (!date || !(Number(amount) > 0)) return res.status(400).json({ error: 'Date et montant requis' });
    const { rows } = await pool.query(
      `INSERT INTO withdrawals (id, user_id, date, amount, suggested_amount, mode, note)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7) RETURNING *`,
      [isUUID(id) ? id : null, req.user.userId, date, Number(amount), suggestedAmount, mode, note]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.json({ ok: true });
    await pool.query('DELETE FROM withdrawals WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function isUUID(s) {
  return s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

module.exports = router;
