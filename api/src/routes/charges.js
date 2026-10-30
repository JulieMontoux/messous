const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');

router.use(auth);

const FREQUENCIES = ['monthly', 'quarterly', 'yearly'];

const toClient = r => ({
  id: r.id,
  name: r.name,
  amount: Number(r.amount),
  categoryId: r.category_id,
  icon: r.icon,
  frequency: r.frequency || 'monthly',
  dueMonth: r.due_month ?? null,
  lastPaidAt: r.last_paid_at || null,
  lastPaidAmount: r.last_paid_amount != null ? Math.abs(Number(r.last_paid_amount)) : null,
});

const freqOf = f => (FREQUENCIES.includes(f) ? f : 'monthly');
const dueMonthOf = (f, m) => (freqOf(f) === 'monthly' || !m ? null : Math.min(12, Math.max(1, Number(m))));

router.get('/', async (req, res) => {
  try {
    // Dernier paiement bancaire rattaché à chaque charge
    const { rows } = await pool.query(
      `SELECT c.*, p.booking_date AS last_paid_at, p.amount AS last_paid_amount
       FROM fixed_charges c
       LEFT JOIN LATERAL (
         SELECT booking_date, amount FROM bank_transactions b
         WHERE b.fixed_charge_id = c.id ORDER BY booking_date DESC LIMIT 1
       ) p ON true
       WHERE c.user_id = $1 ORDER BY c.sort_order, c.created_at`,
      [req.user.userId]
    );
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { id, name, amount, categoryId, icon, frequency, dueMonth } = req.body;
    const { rows } = await pool.query(
      `INSERT INTO fixed_charges (id, user_id, name, amount, category_id, icon, frequency, due_month)
       VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [isUUID(id) ? id : null, req.user.userId, name, amount, categoryId, icon, freqOf(frequency), dueMonthOf(frequency, dueMonth)]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, amount, categoryId, icon, frequency, dueMonth } = req.body;
    const { rows } = await pool.query(
      `UPDATE fixed_charges SET name=$2, amount=$3, category_id=$4, icon=$5, frequency=$7, due_month=$8
       WHERE id=$1 AND user_id=$6 RETURNING *`,
      [req.params.id, name, amount, categoryId, icon, req.user.userId, freqOf(frequency), dueMonthOf(frequency, dueMonth)]
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
