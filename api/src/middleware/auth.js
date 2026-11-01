const jwt = require('jsonwebtoken');
const { pool } = require('../db');

module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    const { rows } = await pool.query('SELECT id, token_version FROM users WHERE id = $1', [payload.userId]);
    if (!rows.length) return res.status(401).json({ error: 'Compte introuvable' });
    // Mot de passe changé depuis l'émission du jeton : session expirée
    if ((payload.tv || 0) !== rows[0].token_version) return res.status(401).json({ error: 'Session expirée, reconnecte-toi' });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
};
