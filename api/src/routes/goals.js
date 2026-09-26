const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const toClient = r => ({
  id: r.id,
  name: r.name,
  targetAmount: Number(r.target_amount),
  currentAmount: Number(r.current_amount),
  targetDate: r.target_date ? String(r.target_date).slice(0, 10) : null,
  icon: r.icon,
  createdAt: r.created_at,
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM savings_goals WHERE user_id = $1 ORDER BY created_at ASC',
      [req.user.userId]
    );
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { name, targetAmount, currentAmount = 0, targetDate = null, icon = '🎯' } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, icon)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [req.user.userId, name, targetAmount, currentAmount, targetDate, icon]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, targetAmount, currentAmount, targetDate, icon } = req.body;
    const { rows } = await pool.query(
      `UPDATE savings_goals
       SET name=$2, target_amount=$3, current_amount=$4, target_date=$5, icon=$6
       WHERE id=$1 AND user_id=$7 RETURNING *`,
      [req.params.id, name, targetAmount, currentAmount, targetDate ?? null, icon, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /:id/deposit — add amount to current_amount
router.patch('/:id/deposit', async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || Number(amount) <= 0) return res.status(400).json({ error: 'Montant invalide' });
    const { rows } = await pool.query(
      `UPDATE savings_goals
       SET current_amount = current_amount + $2
       WHERE id=$1 AND user_id=$3 RETURNING *`,
      [req.params.id, Number(amount), req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM savings_goals WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
