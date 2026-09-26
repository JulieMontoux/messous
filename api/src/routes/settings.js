const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM settings WHERE user_id = $1', [req.user.userId]);
  res.json(rows[0] || { viewMode: 'monthly' });
});

router.put('/', async (req, res) => {
  const { viewMode } = req.body;
  const { rows } = await pool.query(
    'UPDATE settings SET view_mode = $2 WHERE user_id = $1 RETURNING *',
    [req.user.userId, viewMode]
  );
  res.json(rows[0]);
});

module.exports = router;
