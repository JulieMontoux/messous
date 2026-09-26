const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const toClient = r => ({
  id: r.id,
  name: r.name,
  categoryId: r.category_id,
  icon: r.icon,
  colorKey: r.color_key,
  type: r.type,
  budgetMonthly: Number(r.budget_monthly),
});

function isUUID(s) {
  return s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM envelopes WHERE user_id = $1 ORDER BY sort_order, created_at',
      [req.user.userId]
    );
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { id, name, categoryId, icon, colorKey, type, budgetMonthly } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO envelopes (id, user_id, name, category_id, icon, color_key, type, budget_monthly) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [isUUID(id) ? id : null, req.user.userId, name, categoryId, icon, colorKey, type, budgetMonthly]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, categoryId, icon, colorKey, type, budgetMonthly } = req.body;
    const { rows } = await pool.query(
      'UPDATE envelopes SET name=$2, category_id=$3, icon=$4, color_key=$5, type=$6, budget_monthly=$7 WHERE id=$1 AND user_id=$8 RETURNING *',
      [req.params.id, name, categoryId, icon, colorKey, type, budgetMonthly, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.json({ ok: true });
    await pool.query('DELETE FROM envelopes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
