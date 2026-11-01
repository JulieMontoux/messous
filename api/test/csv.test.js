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
