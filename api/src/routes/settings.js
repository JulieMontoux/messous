const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.userId]);
  res.json(rows[0] || { viewMode: 'monthly', budgetRule: '50-30-20' });
});

router.put('/', async (req, res) => {
  const { viewMode, budgetRule } = req.body;
  const { rows } = await pool.query(
    'UPDATE settings SET view_mode = COALESCE($2, view_mode), budget_rule = COALESCE($3, budget_rule) WHERE user_id = $1 RETURNING *',
    [req.user.userId, viewMode ?? null, budgetRule ?? null]
  );
  res.json(rows[0]);
});

module.exports = router;
