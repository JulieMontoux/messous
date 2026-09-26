const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const toClient = r => ({ id: r.id, name: r.name, amount: Number(r.amount), categoryId: r.category_id, icon: r.icon });

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM fixed_charges WHERE user_id = $1 ORDER BY sort_order, created_at',
      [req.user.userId]
    );
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { id, name, amount, categoryId, icon } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO fixed_charges (id, user_id, name, amount, category_id, icon) VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6) RETURNING *',
      [isUUID(id) ? id : null, req.user.userId, name, amount, categoryId, icon]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, amount, categoryId, icon } = req.body;
    const { rows } = await pool.query(
      'UPDATE fixed_charges SET name=$2, amount=$3, category_id=$4, icon=$5 WHERE id=$1 AND user_id=$6 RETURNING *',
      [req.params.id, name, amount, categoryId, icon, req.user.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!isUUID(req.params.id)) return res.json({ ok: true });
    await pool.query('DELETE FROM fixed_charges WHERE id=$1 AND user_id=$2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function isUUID(s) {
  return s && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

module.exports = router;
