const router = require('express').Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { createLimiter } = require('../middleware/rateLimit');
const auth = require('../middleware/auth');
const mailer = require('../lib/mailer');

const MIN_PASSWORD = 6;
const RESET_TTL_MS = 60 * 60 * 1000;
const SECURITY_FOOTER = 'E-mail de sécurité envoyé automatiquement par MesSous.';

// 10 échecs de connexion max par IP+e-mail sur 15 min, et 30 par IP (tous comptes confondus)
const byAccount = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
const byIp = createLimiter({ max: 30, windowMs: 15 * 60 * 1000 });
// 5 créations de compte par IP et par heure
const registrations = createLimiter({ max: Number(process.env.REGISTER_LIMIT) || 5, windowMs: 60 * 60 * 1000 });
// Mot de passe oublié : 5 demandes par IP et 3 par adresse e-mail par heure
const resetsByIp = createLimiter({ max: Number(process.env.RESET_LIMIT) || 5, windowMs: 60 * 60 * 1000 });
const resetsByEmail = createLimiter({ max: 3, windowMs: 60 * 60 * 1000 });
// Mot de passe actuel erroné (changement, suppression) : 10 essais par compte sur 15 min
const byUser = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });

// Le jeton porte la version du mot de passe : en changer invalide les jetons déjà émis
function signToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, tv: user.token_version || 0 }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const normEmail = email => String(email || '').toLowerCase().trim();

// E-mail de sécurité : un échec d'envoi ne fait pas échouer l'action
async function notify(to, subject, title, body, cta) {
  try {
    await mailer.sendMail({ to, subject, html: mailer.layout(title, body, cta, SECURITY_FOOTER) });
  } catch (err) {
    console.error('[mail]', subject, err.message);
  }
}

async function checkPassword(userId, password) {
  const { rows: [user] } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  const ok = !!(user && password && await bcrypt.compare(String(password), user.password_hash));
  return ok ? user : null;
}

function tooMany(res, seconds) {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ error: `Trop de tentatives. Réessaie dans ${Math.ceil(seconds / 60)} min.` });
}

router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Email et mot de passe requis (min ${MIN_PASSWORD} caractères)` });
  }
  const wait = registrations.blockedFor(req.ip);
  if (wait) return tooMany(res, wait);
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, token_version',
      [email.toLowerCase().trim(), hash]
    );
    const user = rows[0];
    registrations.fail(req.ip);
    await pool.query('INSERT INTO profiles (user_id) VALUES ($1)', [user.id]);
    await pool.query('INSERT INTO settings (user_id) VALUES ($1)', [user.id]);
    res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
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
    res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Mot de passe oublié : envoie un lien de réinitialisation valable 1 heure.
// Réponse identique que le compte existe ou non (on ne révèle pas les adresses inscrites).
router.post('/forgot', async (req, res) => {
  const email = normEmail(req.body.email);
  if (!email) return res.status(400).json({ error: 'Email requis' });
  const wait = Math.max(resetsByIp.blockedFor(req.ip), resetsByEmail.blockedFor(email));
  if (wait) return tooMany(res, wait);
  resetsByIp.fail(req.ip);
  resetsByEmail.fail(email);
  try {
    const { rows: [user] } = await pool.query('SELECT id, email FROM users WHERE email = $1', [email]);
    if (user) {
      if (!process.env.APP_URL) {
        // Sans adresse publique connue, pas de lien fiable (on ne se fie pas à l'en-tête Host)
        console.error('[auth] APP_URL non défini : lien de réinitialisation non envoyé');
      } else {
        const token = crypto.randomBytes(32).toString('base64url');
        await pool.query('DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]);
        await pool.query(
          'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
          [user.id, hashToken(token), new Date(Date.now() + RESET_TTL_MS)]
        );
        // Jeton dans le fragment (#) : il n'est jamais envoyé au serveur ni écrit dans ses journaux
        await notify(user.email, 'Réinitialiser ton mot de passe MesSous', 'Mot de passe oublié ?',
          '<p>Tu as demandé à changer ton mot de passe. Le lien ci-dessous est valable <strong>1 heure</strong> et ne sert qu\'une fois.</p>'
          + '<p style="color:#64748b;font-size:13px">Si ce n\'est pas toi, ignore cet e-mail : ton mot de passe reste inchangé.</p>',
          { href: mailer.appUrl(`/#reset=${token}`), label: 'Choisir un nouveau mot de passe' });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Nouveau mot de passe à partir du lien reçu par e-mail ; connecte directement
router.post('/reset', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password || String(password).length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Lien et mot de passe requis (min ${MIN_PASSWORD} caractères)` });
  }
  try {
    const { rows: [reset] } = await pool.query(
      'SELECT * FROM password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()',
      [hashToken(String(token))]
    );
    if (!reset) return res.status(400).json({ error: 'Lien invalide ou expiré : refais une demande.' });
    const hash = await bcrypt.hash(String(password), 10);
    const { rows: [user] } = await pool.query(
      'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING id, email, token_version',
      [reset.user_id, hash]
    );
    await pool.query('UPDATE password_resets SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);
    await notify(user.email, 'Ton mot de passe MesSous a été changé', 'Mot de passe modifié',
      '<p>Le mot de passe de ton compte vient d\'être réinitialisé et tes autres appareils ont été déconnectés.</p>'
      + '<p style="color:#64748b;font-size:13px">Si ce n\'est pas toi, refais immédiatement une demande « Mot de passe oublié ».</p>');
    res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Changement de mot de passe depuis le profil : les autres appareils sont déconnectés
router.put('/password', auth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user.userId;
  if (!newPassword || String(newPassword).length < MIN_PASSWORD) {
    return res.status(400).json({ error: `Nouveau mot de passe trop court (min ${MIN_PASSWORD} caractères)` });
  }
  const wait = byUser.blockedFor(userId);
  if (wait) return tooMany(res, wait);
  try {
    if (!(await checkPassword(userId, currentPassword))) {
      byUser.fail(userId);
      return res.status(403).json({ error: 'Mot de passe actuel incorrect' });
    }
    byUser.reset(userId);
    const hash = await bcrypt.hash(String(newPassword), 10);
    const { rows: [user] } = await pool.query(
      'UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1 RETURNING id, email, token_version',
      [userId, hash]
    );
    await pool.query('DELETE FROM password_resets WHERE user_id = $1', [userId]);
    await notify(user.email, 'Ton mot de passe MesSous a été changé', 'Mot de passe modifié',
      '<p>Le mot de passe de ton compte vient d\'être modifié depuis ton profil. Tes autres appareils ont été déconnectés.</p>'
      + '<p style="color:#64748b;font-size:13px">Si ce n\'est pas toi, utilise « Mot de passe oublié » sur l\'écran de connexion.</p>');
    res.json({ token: signToken(user), user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Suppression définitive du compte et de toutes ses données (suppression en cascade)
router.delete('/account', auth, async (req, res) => {
  const userId = req.user.userId;
  const wait = byUser.blockedFor(userId);
  if (wait) return tooMany(res, wait);
  try {
    const user = await checkPassword(userId, req.body?.password);
    if (!user) {
      byUser.fail(userId);
      return res.status(403).json({ error: 'Mot de passe incorrect' });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await notify(user.email, 'Ton compte MesSous a été supprimé', 'Compte supprimé',
      '<p>Ton compte et toutes ses données (budget, dépenses, banque, objectifs…) ont été supprimés.</p>');
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
