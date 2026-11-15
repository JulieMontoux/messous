const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');
const { localDate } = require('../lib/dates');

router.use(auth);

// CSV pour Excel en français : séparateur « ; », décimales à virgule, BOM UTF-8
const num = v => (v == null || v === '' ? '' : Number(v).toFixed(2).replace('.', ','));
const cell = v => {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header, rows) => '﻿' + [header, ...rows].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';

const EXPORTS = {
  depenses: {
    header: ['Date', 'Enveloppe', 'Type', 'Montant', 'Paiement', 'Description'],
    query: `SELECT t.date, e.name AS envelope, e.type, t.amount, t.payment_method, t.note
            FROM transactions t LEFT JOIN envelopes e ON e.id = t.envelope_id
            WHERE t.user_id = $1 ORDER BY t.date DESC, t.created_at DESC`,
    row: r => [r.date, r.envelope, { need: 'Besoin', want: 'Envie', saving: 'Épargne' }[r.type] || '', num(r.amount), r.payment_method === 'card' ? 'Carte' : 'Espèces', r.note],
  },
  banque: {
    header: ['Date', 'Libellé', 'Montant', 'Classement', 'Compte'],
    query: `SELECT b.booking_date, b.label, b.amount, b.ignored, e.name AS envelope, f.name AS charge,
                   w.id AS withdrawal, a.person, acc.name AS account
            FROM bank_transactions b
            LEFT JOIN envelopes e ON e.id = b.envelope_id
            LEFT JOIN fixed_charges f ON f.id = b.fixed_charge_id
            LEFT JOIN withdrawals w ON w.bank_transaction_id = b.id
            LEFT JOIN advances a ON a.bank_transaction_id = b.id
            LEFT JOIN bank_accounts acc ON acc.id = b.account_id
            WHERE b.user_id = $1 ORDER BY b.booking_date DESC, b.created_at DESC`,
    row: r => [
      r.booking_date, r.label, num(r.amount),
      r.ignored ? 'Ignorée' : r.envelope ? `Enveloppe : ${r.envelope}` : r.charge ? `Charge fixe : ${r.charge}`
        : r.withdrawal ? "Retrait d'espèces" : r.person ? `Avance : ${r.person}` : Number(r.amount) < 0 ? 'À classer' : '',
      r.account,
    ],
  },
  historique: {
    header: ['Mois', 'Salaire', 'Charges fixes', 'Enveloppes', 'Épargne programmée', 'Enveloppes épargne', 'Reste prévu', 'Épargne prévue', 'Épargne réelle versée', 'Reste réel', 'Clôturé le'],
    query: 'SELECT * FROM savings_history WHERE user_id = $1 ORDER BY month DESC',
    row: r => [r.month, num(r.salary), num(r.total_fixed), num(r.total_envelopes), num(r.programmed_savings), num(r.saving_envelopes),
      num(r.remainder), num(r.total_savings), num(r.actual_savings), num(r.actual_remainder), r.closed_at ? localDate(new Date(r.closed_at)) : ''],
  },
  retraits: {
    header: ['Date', 'Montant retiré', 'Montant conseillé', 'Origine', 'Note'],
    query: 'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY date DESC',
    row: r => [r.date, num(r.amount), num(r.suggested_amount), r.bank_transaction_id ? 'Relevé bancaire' : 'Saisie', r.note],
  },
  charges: {
    header: ['Nom', 'Montant', 'Fréquence', "Mois d'échéance", 'Fin prévue'],
    query: 'SELECT * FROM fixed_charges WHERE user_id = $1 ORDER BY sort_order, created_at',
    row: r => [r.name, num(r.amount), { monthly: 'Mensuelle', quarterly: 'Trimestrielle', yearly: 'Annuelle' }[r.frequency] || 'Mensuelle', r.due_month || '', r.end_month || ''],
  },
  avances: {
    header: ['Date', 'Personne', 'Montant', 'Note', 'Remboursé le'],
    query: 'SELECT * FROM advances WHERE user_id = $1 ORDER BY date DESC',
    row: r => [r.date, r.person, num(r.amount), r.note, r.repaid_at || ''],
  },
};

router.get('/:kind.csv', async (req, res) => {
  const def = EXPORTS[req.params.kind];
  if (!def) return res.status(404).json({ error: 'Export inconnu' });
  try {
    const { rows } = await pool.query(def.query, [req.user.userId]);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="messous-${req.params.kind}-${localDate()}.csv"`);
    res.send(toCsv(def.header, rows.map(def.row)));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.EXPORT_KINDS = Object.keys(EXPORTS);
