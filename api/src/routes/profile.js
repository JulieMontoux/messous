const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');
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
};

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.userId]);
  const { rows: [user] } = await pool.query('SELECT email FROM users WHERE id = $1', [req.user.userId]);
  res.json(rows[0] ? { ...toClient(rows[0]), accountEmail: user?.email || '', mailConfigured: isMailConfigured() } : {});
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

module.exports = router;
