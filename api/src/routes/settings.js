const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const BUDGET_RULE_IDS = ['50-30-20', '55-10-5-15-15', '80-20', '70-20-10', 'sixty', 'six-jars', 'zero-based', 'kakeibo'];

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.userId]);
    res.json(rows[0] || { viewMode: 'monthly', budgetRule: '50-30-20' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crée la ligne si elle manque (anciens comptes)
router.put('/', async (req, res) => {
  try {
    // Champs absents : on garde la valeur enregistrée
    const viewMode = req.body.viewMode == null ? null : req.body.viewMode === 'weekly' ? 'weekly' : 'monthly';
    const budgetRule = BUDGET_RULE_IDS.includes(req.body.budgetRule) ? req.body.budgetRule : null;
    const { rows } = await pool.query(
      `INSERT INTO settings (user_id, view_mode, budget_rule) VALUES ($1, COALESCE($2, 'monthly'), COALESCE($3, '50-30-20'))
       ON CONFLICT (user_id) DO UPDATE SET
         view_mode = COALESCE($2, settings.view_mode), budget_rule = COALESCE($3, settings.budget_rule)
       RETURNING *`,
      [req.user.userId, viewMode, budgetRule]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
