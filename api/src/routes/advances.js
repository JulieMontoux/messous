const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');
const { localDate } = require('../lib/dates');

router.use(auth);

// Dépense avancée pour quelqu'un : hors enveloppes, suivie jusqu'au remboursement
const toClient = r => ({
  id: r.id,
  person: r.person,
  amount: Number(r.amount),
  note: r.note || '',
  date: r.date,
  repaidAt: r.repaid_at || null,
  bankTransactionId: r.bank_transaction_id || null,
});

router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM advances WHERE user_id = $1 ORDER BY date DESC, created_at DESC', [req.user.userId]);
    res.json(rows.map(toClient));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  try {
    const { person, amount, note = '', date } = req.body;
    if (!person || !(Number(amount) > 0)) return res.status(400).json({ error: 'Personne et montant requis' });
    const { rows } = await pool.query(
      'INSERT INTO advances (user_id, person, amount, note, date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.userId, String(person).trim().slice(0, 100), Number(amount), String(note).slice(0, 255), date || localDate()]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Marquer remboursé (ou annuler le remboursement)
router.put('/:id/repaid', async (req, res) => {
  try {
    const { repaid = true, date } = req.body;
    const { rows } = await pool.query(
      'UPDATE advances SET repaid_at = $3 WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.userId, repaid ? (date || localDate()) : null]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM advances WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
