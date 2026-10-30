const { isCardLabel, hashId } = require('./common');

function detectDelimiter(line) {
  const counts = [';', ',', '\t'].map(d => [d, line.split(d).length]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][0];
}

function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; } else quoted = !quoted;
    } else if (c === delim && !quoted) {
      out.push(cur.trim()); cur = '';
    } else cur += c;
  }
  out.push(cur.trim());
  return out;
}

function parseAmount(s) {
  if (s == null) return null;
  let v = String(s).replace(/\s| |€|EUR/g, '');
  if (!v) return null;
  if (v.includes(',') && v.includes('.')) {
    v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  } else {
    v = v.replace(',', '.');
  }
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseDate(s) {
  if (!s) return null;
  const v = String(s).trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

function findCol(headers, candidates) {
  const h = headers.map(norm);
  for (const c of candidates) {
    const i = h.findIndex(x => x === c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = h.findIndex(x => x.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

// Parse un export CSV bancaire (formats FR courants : séparateur ; ou ,, montants "1 234,56")
function parseBankCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('Fichier CSV vide');

  // La ligne d'en-tête est la première qui contient une colonne "date"
  const headerIdx = lines.findIndex(l => /date/i.test(l));
  if (headerIdx < 0) throw new Error('Colonne « Date » introuvable');
  const delim = detectDelimiter(lines[headerIdx]);
  const headers = splitLine(lines[headerIdx], delim);

  const iDate = findCol(headers, ['date operation', 'date de comptabilisation', 'date', 'date valeur']);
  const iLabel = findCol(headers, ['libelle', 'libelle simplifie', 'libelle operation', 'description', 'label', 'intitule']);
  const iAmount = findCol(headers, ['montant', 'amount', 'montant(euros)', 'montant (eur)']);
  const iDebit = findCol(headers, ['debit', 'debit euros']);
  const iCredit = findCol(headers, ['credit', 'credit euros']);
  const iType = findCol(headers, ['type', 'type operation', 'categorie']);

  if (iDate < 0 || iLabel < 0 || (iAmount < 0 && iDebit < 0)) {
    throw new Error('Colonnes attendues : Date, Libellé, Montant (ou Débit/Crédit)');
  }

  const seen = {};
  const out = [];
  for (const line of lines.slice(headerIdx + 1)) {
    const cols = splitLine(line, delim);
    const date = parseDate(cols[iDate]);
    if (!date) continue;
    let amount;
    if (iAmount >= 0 && cols[iAmount] !== '') {
      amount = parseAmount(cols[iAmount]);
    } else {
      const debit = parseAmount(cols[iDebit]);
      const credit = iCredit >= 0 ? parseAmount(cols[iCredit]) : null;
      amount = debit ? -Math.abs(debit) : credit ? Math.abs(credit) : null;
    }
    if (amount == null) continue;
    const label = cols[iLabel] || '';
    const type = iType >= 0 ? cols[iType] : '';
    const key = hashId(date, amount.toFixed(2), label);
    seen[key] = (seen[key] || 0) + 1;
    out.push({
      externalId: `csv:${key}:${seen[key]}`,
      bookingDate: date,
      amount,
      label,
      isCard: isCardLabel(`${label} ${type}`),
    });
  }
  return out;
}

module.exports = { parseBankCsv, parseAmount, parseDate };
