const router = require('express').Router();
const { pool } = require('../db');
const auth = require('../middleware/auth');
const { getVapid, sendPush } = require('../lib/push');

router.use(auth);

router.get('/public-key', async (req, res) => {
  try {
    res.json({ publicKey: (await getVapid()).publicKey });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/subscribe', async (req, res) => {
  try {
    const sub = req.body?.subscription;
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return res.status(400).json({ error: 'Abonnement invalide' });
    await pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [req.user.userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    await pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [req.user.userId, req.body?.endpoint]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/test', async (req, res) => {
  try {
    const sent = await sendPush(req.user.userId, { title: '✅ MesSous', body: 'Les notifications fonctionnent sur cet appareil.', url: '/?page=settings' });
    if (!sent) return res.status(400).json({ error: 'Aucun appareil abonné' });
    res.json({ ok: true, sent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
