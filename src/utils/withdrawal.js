import { weeklyAmount, spentInPeriod } from './budget';

const round5 = v => Math.round(v / 5) * 5;
const roundUp5 = v => Math.ceil(v / 5) * 5;

function toBudget(monthly, mode) {
  return round5(mode === 'weekly' ? weeklyAmount(monthly) : monthly);
}

function withSpending(envList, transactions, mode) {
  return envList.map(e => {
    const budget = toBudget(e.budgetMonthly, mode);
    const spent = spentInPeriod(transactions, e.id, mode);
    return { ...e, budget, spent, toWithdraw: Math.max(0, budget - spent) };
  });
}

export function computeWithdrawal({ envelopes, transactions, mode, idealNeeds, idealWants, idealSavings }) {
  const tobaccoEnv = envelopes.find(e => e.categoryId === 'tobacco');
  const needEnvs = envelopes.filter(e => e.type === 'need');
  const wantEnvs = envelopes.filter(e => e.type === 'want' && e.categoryId !== 'tobacco');
  const savingEnvs = envelopes.filter(e => e.type === 'saving');

  const needsData = withSpending(needEnvs, transactions, mode);
  const wantData = withSpending(wantEnvs, transactions, mode);
  const savingData = withSpending(savingEnvs, transactions, mode);

  const tobaccoBudget = tobaccoEnv ? toBudget(tobaccoEnv.budgetMonthly, mode) : 0;
  const tobaccoSpent = tobaccoEnv ? spentInPeriod(transactions, tobaccoEnv.id, mode) : 0;
  const tobaccoToWithdraw = Math.max(0, tobaccoBudget - tobaccoSpent);

  // Envelope mode
  const envNeedsTotal = needsData.reduce((s, e) => s + e.toWithdraw, 0);
  const envWantsTotal = wantData.reduce((s, e) => s + e.toWithdraw, 0);
  const envSavingsTotal = savingData.reduce((s, e) => s + e.toWithdraw, 0);
  const envGrandTotal = roundUp5(envNeedsTotal + tobaccoToWithdraw + envWantsTotal + envSavingsTotal);

  // Ideal mode — spending-aware per group
  const needsSpent = needsData.reduce((s, e) => s + e.spent, 0);
  const wantSpent = wantData.reduce((s, e) => s + e.spent, 0);
  const savingSpent = savingData.reduce((s, e) => s + e.spent, 0);

  const idealNeedsBudget = toBudget(idealNeeds, mode);
  const idealWantsBudget = Math.max(toBudget(50, mode), toBudget(idealWants, mode) - tobaccoBudget);
  const idealSavingsBudget = toBudget(idealSavings, mode);

  const idealNeedsToWithdraw = Math.max(0, idealNeedsBudget - needsSpent);
  const idealWantsToWithdraw = Math.max(0, idealWantsBudget - wantSpent);
  const idealSavingsToWithdraw = Math.max(0, idealSavingsBudget - savingSpent);
  const idealGrandTotal = roundUp5(idealNeedsToWithdraw + tobaccoToWithdraw + idealWantsToWithdraw + idealSavingsToWithdraw);

  return {
    envelopes: {
      needs: needsData,
      wants: wantData,
      savings: savingData,
      tobacco: { budget: tobaccoBudget, spent: tobaccoSpent, toWithdraw: tobaccoToWithdraw },
      needsTotal: envNeedsTotal,
      wantsTotal: envWantsTotal,
      savingsTotal: envSavingsTotal,
      grandTotal: envGrandTotal,
    },
    ideal: {
      needsBudget: idealNeedsBudget,
      wantsBudget: idealWantsBudget,
      savingsBudget: idealSavingsBudget,
      needsToWithdraw: idealNeedsToWithdraw,
      wantsToWithdraw: idealWantsToWithdraw,
      savingsToWithdraw: idealSavingsToWithdraw,
      tobaccoToWithdraw,
      grandTotal: idealGrandTotal,
    },
  };
}
