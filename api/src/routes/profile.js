const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');
const bcrypt = require('bcryptjs');
const { monthKey } = require('../lib/dates');
const { sendMail, layout, isMailConfigured, recipientFor } = require('../lib/mailer');

router.use(auth);

function toClient(r) {
  return {
    firstName: r.first_name || '',
    netSalary: Number(r.net_salary) || 0,
    hasCar: r.has_car ?? true,
    isSmoker: r.is_smoker ?? false,
    householdAdults: r.household_adults ?? 1,
    householdChildren: r.household_children ?? 0,
    pets: r.pets || { dogs: 0, cats: 0, other: 0 },
    region: r.region || 'Île-de-France',
    supermarket: r.supermarket || 'leclerc',
    registrationDate: r.registration_date || null,
    onboardingDone: r.onboarding_done ?? false,
    tobaccoType: r.tobacco_type || 'indus',
    tobaccoPackPrice: r.tobacco_pack_price != null ? Number(r.tobacco_pack_price) : 13,
    tobaccoPacksPerWeek: r.tobacco_packs_per_week != null ? Number(r.tobacco_packs_per_week) : 7,
    alertsEnabled: r.alerts_enabled ?? true,
    alertThreshold: r.alert_threshold ?? 80,
    alertEmail: r.alert_email || '',
    monthEndEmail: r.month_end_email ?? true,
    roundWithdrawals: r.round_withdrawals ?? true,
    idealNeedsPct: r.ideal_needs_pct ?? 50,
    idealWantsPct: r.ideal_wants_pct ?? 30,
    idealSavingsPct: r.ideal_savings_pct ?? 20,
    nextSalary: r.next_salary != null ? Number(r.next_salary) : null,
    nextSalaryFrom: r.next_salary_from || null,
    manualBalance: r.manual_balance != null ? Number(r.manual_balance) : null,
    manualBalanceAt: r.manual_balance_at || null,
    monthlyReportEmail: r.monthly_report_email ?? true,
    theme: r.theme || 'auto',
    tobaccoQuitDate: r.tobacco_quit_date || null,
  };
}

// Champ client → colonne SQL (+ conversion éventuelle)
const FIELDS = {
  firstName: 'first_name',
  netSalary: 'net_salary',
  hasCar: 'has_car',
  isSmoker: 'is_smoker',
  householdAdults: 'household_adults',
  householdChildren: 'household_children',
  pets: ['pets', v => JSON.stringify(v)],
  region: 'region',
  supermarket: 'supermarket',
  registrationDate: 'registration_date',
  onboardingDone: 'onboarding_done',
  tobaccoType: 'tobacco_type',
  tobaccoPackPrice: 'tobacco_pack_price',
  tobaccoPacksPerWeek: 'tobacco_packs_per_week',
  alertsEnabled: 'alerts_enabled',
  alertThreshold: 'alert_threshold',
  alertEmail: ['alert_email', v => (v ? String(v).trim() : null)],
  monthEndEmail: 'month_end_email',
  roundWithdrawals: 'round_withdrawals',
  idealNeedsPct: 'ideal_needs_pct',
  idealWantsPct: 'ideal_wants_pct',
  idealSavingsPct: 'ideal_savings_pct',
  monthlyReportEmail: 'monthly_report_email',
  theme: ['theme', v => (['auto', 'light', 'dark'].includes(v) ? v : 'auto')],
  tobaccoQuitDate: ['tobacco_quit_date', v => v || null],
};

// Applique un nouveau salaire programmé dès que son mois d'effet est arrivé
async function applyPendingSalary(userId) {
  await pool.query(
    `UPDATE profiles SET net_salary = next_salary, next_salary = NULL, next_salary_from = NULL
     WHERE user_id = $1 AND next_salary IS NOT NULL AND next_salary_from <= $2`,
    [userId, monthKey()]
  );
}

router.get('/', async (req, res) => {
  try {
    await applyPendingSalary(req.user.userId);
    const { rows } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.userId]);
    const { rows: [user] } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
    res.json(rows[0] ? { ...toClient(rows[0]), accountEmail: user?.email || '', mailConfigured: isMailConfigured() } : {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/', async (req, res) => {
  try {
    const cols = [];
    const vals = [req.user.userId];
    for (const [key, def] of Object.entries(FIELDS)) {
      if (req.body[key] === undefined || req.body[key] === null) continue;
      const [col, conv] = Array.isArray(def) ? def : [def, v => v];
      vals.push(conv(req.body[key]));
      cols.push([col, `$${vals.length}`]);
    }
    await pool.query('INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [req.user.userId]);
    const { rows } = cols.length
      ? await pool.query(
          `UPDATE profiles SET ${cols.map(([c, p]) => `${c} = ${p}`).join(', ')} WHERE user_id = $1 RETURNING *`,
          vals
        )
      : await pool.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.userId]);
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Nouveau salaire : immédiat (from = mois en cours ou absent) ou à partir d'un mois futur
router.put('/salary', async (req, res) => {
  try {
    const { amount, from } = req.body;
    const value = Number(amount);
    if (!(value >= 0)) return res.status(400).json({ error: 'Montant invalide' });
    const current = monthKey();
    if (!from || from <= current) {
      await pool.query('UPDATE profiles SET net_salary = $2, next_salary = NULL, next_salary_from = NULL WHERE user_id = $1', [req.user.userId, value]);
    } else if (/^\d{4}-\d{2}$/.test(from)) {
      await pool.query('UPDATE profiles SET next_salary = $2, next_salary_from = $3 WHERE user_id = $1', [req.user.userId, value, from]);
    } else {
      return res.status(400).json({ error: 'Mois invalide' });
    }
    const { rows } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.userId]);
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Solde du compte saisi à la main (utilisé quand la banque ne fournit pas de solde)
router.put('/balance', async (req, res) => {
  try {
    const { balance } = req.body;
    const value = balance === null || balance === '' ? null : Number(balance);
    if (value !== null && !Number.isFinite(value)) return res.status(400).json({ error: 'Montant invalide' });
    const { rows } = await pool.query(
      'UPDATE profiles SET manual_balance = $2, manual_balance_at = CASE WHEN $2::numeric IS NULL THEN NULL ELSE NOW() END WHERE user_id = $1 RETURNING *',
      [req.user.userId, value]
    );
    res.json(toClient(rows[0]));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/salary/pending', async (req, res) => {
  try {
    await pool.query('UPDATE profiles SET next_salary = NULL, next_salary_from = NULL WHERE user_id = $1', [req.user.userId]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/test-email', async (req, res) => {
  try {
    if (!isMailConfigured()) return res.status(400).json({ error: 'SMTP non configuré sur le serveur (variables SMTP_*)' });
    const recipient = await recipientFor(req.user.userId);
    await sendMail({
      to: recipient.email,
      subject: '✅ MesSous : e-mails activés',
      html: layout('Les e-mails fonctionnent !', '<p>Tu recevras ici les alertes d\'enveloppes et le rappel de fin de mois.</p>'),
    });
    res.json({ ok: true, to: recipient.email });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

// Réinitialisation complète des données (le compte est conservé). Mot de passe exigé.
router.post('/reset', async (req, res) => {
  const userId = req.user.userId;
  const client = await pool.connect();
  try {
    const { password } = req.body;
    const { rows: [user] } = await client.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (!user || !password || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(403).json({ error: 'Mot de passe incorrect' });
    }
    await client.query('BEGIN');
    for (const table of [
      'bank_rules', 'bank_transactions', 'bank_accounts', 'bank_connections', 'withdrawals',
      'recurring_transactions', 'transactions', 'envelopes', 'fixed_charges', 'savings_history',
      'savings_goals', 'ai_suggestions', 'email_log', 'envelope_carryovers', 'advances', 'push_subscriptions', 'profiles',
    ]) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
    await client.query('INSERT INTO profiles (user_id) VALUES ($1)', [userId]);
    await client.query("UPDATE settings SET view_mode = 'monthly' WHERE user_id = $1", [userId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
