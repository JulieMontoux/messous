const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.userId]);
    res.json(rows[0] || { viewMode: 'monthly' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Crée la ligne si elle manque (anciens comptes)
router.put('/', async (req, res) => {
  try {
    const viewMode = req.body.viewMode === 'weekly' ? 'weekly' : 'monthly';
    const { rows } = await pool.query(
      `INSERT INTO settings (user_id, view_mode) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET view_mode = EXCLUDED.view_mode RETURNING *`,
      [req.user.userId, viewMode]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
