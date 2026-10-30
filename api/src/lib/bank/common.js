const crypto = require('crypto');

const CARD_RE = /(^|\b)(CB|CARTE|PAIEMENT PAR CARTE|PAIEMENT CB|ACHAT CB|FACTURE CARTE|CARD|VISA|MASTERCARD)(\b|\*)/i;

function isCardLabel(label, code = '') {
  return CARD_RE.test(label || '') || /card|carte|POSD|CCRD/i.test(code || '');
}

// Libellé simplifié du marchand, utilisé pour les règles d'affectation automatique
function merchantKey(label) {
  return String(label || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/PAIEMENT PAR CARTE|PAIEMENT CB|ACHAT CB|FACTURE CARTE|CARTE\s*X?\d*|\bCB\b|\bVISA\b|\bMASTERCARD\b/g, ' ')
    .replace(/\d{2}[/.-]\d{2}([/.-]\d{2,4})?/g, ' ')
    .replace(/[^A-Z ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 3)
    .join(' ')
    .trim();
}

function hashId(...parts) {
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex');
}

module.exports = { isCardLabel, merchantKey, hashId };
