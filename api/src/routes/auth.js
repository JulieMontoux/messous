const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { createLimiter } = require('../middleware/rateLimit');

// 10 échecs de connexion max par IP+e-mail sur 15 min, et 30 par IP (tous comptes confondus)
const byAccount = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const byIp = createLimiter({ max: 30, windowMs: 15 * 60 * 1000 });
// 5 créations de compte par IP et par heure
const registrations = createLimiter({ max: Number(process.env.REGISTER_LIMIT) || 5, windowMs: 60 * 60 * 1000 });

function tooMany(res, seconds) {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ error: `Trop de tentatives. Réessaie dans ${Math.ceil(seconds / 60)} min.` });
}

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Email et mot de passe requis (min 6 caractères)' });
  }
  const wait = registrations.blockedFor(req.ip);
  if (wait) return tooMany(res, wait);
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email.toLowerCase().trim(), hash]
    );
    const user = rows[0];
    registrations.fail(req.ip);
    await pool.query('INSERT INTO profiles (user_id) VALUES ($1)', [user.id]);
    await pool.query('INSERT INTO settings (user_id) VALUES ($1)', [user.id]);
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Email déjà utilisé' });
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs requis' });
  const accountKey = `${req.ip}|${String(email).toLowerCase().trim()}`;
  const wait = Math.max(byAccount.blockedFor(accountKey), byIp.blockedFor(req.ip));
  if (wait) return tooMany(res, wait);
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = rows[0];
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      byAccount.fail(accountKey);
      byIp.fail(req.ip);
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }
    byAccount.reset(accountKey);
    const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
