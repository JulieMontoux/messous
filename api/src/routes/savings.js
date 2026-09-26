const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const toClient = r => ({
  month: r.month,
  salary: Number(r.salary),
  totalFixed: Number(r.total_fixed),
  totalEnvelopes: Number(r.total_envelopes),
  programmedSavings: Number(r.programmed_savings),
  savingEnvelopes: Number(r.saving_envelopes),
  remainder: Number(r.remainder),
  totalSavings: Number(r.total_savings),
  recordedAt: r.recorded_at,
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM savings_history WHERE user_id = $1 ORDER BY month ASC',
      [req.user.userId]
    );
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:month', async (req, res) => {
  try {
    const { salary, totalFixed, totalEnvelopes, programmedSavings, savingEnvelopes, remainder, totalSavings, recordedAt } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO savings_history (user_id, month, salary, total_fixed, total_envelopes, programmed_savings, saving_envelopes, remainder, total_savings, recorded_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (user_id, month) DO UPDATE SET
         salary = EXCLUDED.salary, total_fixed = EXCLUDED.total_fixed,
         total_envelopes = EXCLUDED.total_envelopes, programmed_savings = EXCLUDED.programmed_savings,
         saving_envelopes = EXCLUDED.saving_envelopes, remainder = EXCLUDED.remainder,
         total_savings = EXCLUDED.total_savings, recorded_at = EXCLUDED.recorded_at
       RETURNING *`,
      [req.user.userId, req.params.month, salary, totalFixed, totalEnvelopes, programmedSavings, savingEnvelopes, remainder, totalSavings, recordedAt]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
