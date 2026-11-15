const { test } = require('node:test');
const assert = require('node:assert');
const { parseBankCsv, parseAmount } = require('../src/lib/bank/csv');
const { merchantKey, isCashWithdrawalLabel } = require('../src/lib/bank/common');

test('montants au format français', () => {
  assert.equal(parseAmount('1 234,56'), 1234.56);
  assert.equal(parseAmount('-12,30 €'), -12.3);
  assert.equal(parseAmount('1,234.56'), 1234.56);
});

test('colonnes Débit / Crédit', () => {
  const rows = parseBankCsv('Date;Libellé;Débit;Crédit\n28/10/2026;CB LIDL;12,30;\n29/10/2026;VIR SALAIRE;;2 500,00');
  assert.deepEqual(rows.map(r => r.amount), [-12.3, 2500]);
  assert.equal(rows[0].isCard, true);
  assert.equal(rows[1].isCard, false);
});

test('libellés marchands et retraits', () => {
  assert.equal(merchantKey('PAIEMENT PAR CARTE X1234 CARREFOUR CITY 27/10'), 'CARREFOUR CITY');
  assert.equal(merchantKey('PRLV SEPA AMAZON PRIME FR'), 'AMAZON PRIME FR');
  assert.equal(isCashWithdrawalLabel('RETRAIT DAB 31/10 PARIS'), true);
  assert.equal(isCashWithdrawalLabel('CB CARREFOUR'), false);
});

test('export réel : lignes d\'en-tête de banque, BOM, fins de ligne Windows, guillemets', () => {
  const csv = '﻿Compte courant n° 12345\r\nSolde au 01/11/2026;1 234,56\r\n\r\n'
    + 'Date opération;Date valeur;Libellé;Montant\r\n'
    + '02/11/26;02/11/26;"CB CARREFOUR; MARKET";-12,30\r\n'
    + '03/11/2026;03/11/2026;"VIR ""SALAIRE""";2.500,00\r\n';
  const rows = parseBankCsv(csv);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { externalId: rows[0].externalId, bookingDate: '2026-11-02', amount: -12.3, label: 'CB CARREFOUR; MARKET', isCard: true });
  assert.equal(rows[1].label, 'VIR "SALAIRE"');
  assert.equal(rows[1].amount, 2500);
});

test('séparateur virgule et dates ISO', () => {
  const rows = parseBankCsv('date,description,amount\n2026-11-04,CB LIDL,-5.20\n');
  assert.equal(rows[0].bookingDate, '2026-11-04');
  assert.equal(rows[0].amount, -5.2);
});

test('deux opérations identiques le même jour restent distinctes', () => {
  const rows = parseBankCsv('Date;Libellé;Montant\n04/11/2026;CB BOULANGERIE;-1,20\n04/11/2026;CB BOULANGERIE;-1,20\n');
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].externalId, rows[1].externalId);
});

test('lignes invalides ignorées, colonnes manquantes signalées', () => {
  assert.equal(parseBankCsv('Date;Libellé;Montant\npas une date;X;1\n05/11/2026;Y;\n05/11/2026;Z;-3\n').length, 1);
  assert.throws(() => parseBankCsv('Date;Truc\n01/01/2026;x'), /Colonnes attendues/);
  assert.throws(() => parseBankCsv('Libellé;Montant\nx;1'), /Date/);
  assert.throws(() => parseBankCsv(''), /vide/);
});
