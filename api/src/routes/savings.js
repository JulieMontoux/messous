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
  actualSavings: r.actual_savings != null ? Number(r.actual_savings) : null,
  actualRemainder: r.actual_remainder != null ? Number(r.actual_remainder) : null,
  remainderToGoalId: r.remainder_to_goal_id || null,
  closedAt: r.closed_at || null,
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

// Clôture du mois : épargne réellement versée + reste réel (éventuellement versé sur un objectif)
router.put('/:month/close', async (req, res) => {
  const client = await pool.connect();
  try {
    const { actualSavings, actualRemainder, remainderToGoalId = null } = req.body;
    const month = req.params.month;
    if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ error: 'Mois invalide' });
    await client.query('BEGIN');
    const { rows: [prev] } = await client.query(
      'SELECT actual_remainder, remainder_to_goal_id FROM savings_history WHERE user_id = $1 AND month = $2 FOR UPDATE',
      [req.user.userId, month]
    );
    // Annule un précédent versement du reste sur un objectif avant d'appliquer le nouveau
    if (prev?.remainder_to_goal_id && Number(prev.actual_remainder) > 0) {
      await client.query(
        'UPDATE savings_goals SET current_amount = GREATEST(0, current_amount - $2) WHERE id = $1 AND user_id = $3',
        [prev.remainder_to_goal_id, prev.actual_remainder, req.user.userId]
      );
    }
    const { rows } = await client.query(
      `INSERT INTO savings_history (user_id, month, actual_savings, actual_remainder, remainder_to_goal_id, closed_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, month) DO UPDATE SET
         actual_savings = EXCLUDED.actual_savings, actual_remainder = EXCLUDED.actual_remainder,
         remainder_to_goal_id = EXCLUDED.remainder_to_goal_id, closed_at = NOW()
       RETURNING *`,
      [req.user.userId, month, actualSavings ?? null, actualRemainder ?? null, remainderToGoalId || null]
    );
    if (remainderToGoalId && Number(actualRemainder) > 0) {
      await client.query(
        'UPDATE savings_goals SET current_amount = current_amount + $2 WHERE id = $1 AND user_id = $3',
        [remainderToGoalId, Number(actualRemainder), req.user.userId]
      );
    }
    await client.query('COMMIT');
    res.json(toClient(rows[0]));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
