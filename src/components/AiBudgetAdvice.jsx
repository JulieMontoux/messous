import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { api } from '../api/client';
import { BUDGET_RULES, budgetMethodComparison, idealSplit } from '../utils/budget';

const MONTH_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const monthLabel = k => `${MONTH_FR[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

// Avis d'Ollama sur la méthode de budget la plus adaptée aux dépenses réelles des derniers mois
export default function AiBudgetAdvice() {
  const { state, dispatch } = useBudget();
  const { profile, fixedCharges, envelopes, transactions, settings } = state;
  const [status, setStatus] = useState({ busy: false, error: '', advice: null });
  const includeFixed = profile.budgetIncludeFixed ?? true;
  const currentRuleId = settings.budgetRule || '50-30-20';

  async function ask() {
    const comparison = budgetMethodComparison({
      salary: profile.netSalary,
      charges: fixedCharges,
      envelopes,
      transactions,
      includeFixed,
      savingsGoal: profile.kakeiboSavingsGoal,
      split: idealSplit(profile),
    });
    if (!comparison) {
      setStatus({ busy: false, error: 'Pas encore assez d\'historique : il faut au moins un mois complet de dépenses enregistrées.', advice: null });
      return;
    }
    setStatus({ busy: true, error: '', advice: null });
    try {
      const advice = await api.post('/api/ai/budget-method', { comparison, currentRuleId, includeFixed });
      setStatus({ busy: false, error: '', advice });
    } catch (err) {
      setStatus({ busy: false, error: `L'IA n'a pas répondu (${err.message}).`, advice: null });
    }
  }

  function apply() {
    const { advice } = status;
    if (advice.ruleId !== currentRuleId) dispatch({ type: 'SET_BUDGET_RULE', payload: advice.ruleId });
    if (advice.includeFixed !== includeFixed) dispatch({ type: 'UPDATE_PROFILE', payload: { budgetIncludeFixed: advice.includeFixed } });
    setStatus(s => ({ ...s, applied: true }));
  }

  const { busy, error, advice } = status;
  const alreadyApplied = advice && advice.ruleId === currentRuleId && advice.includeFixed === includeFixed;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
      <button className="btn-secondary w-full flex items-center justify-center gap-2 text-sm" onClick={ask} disabled={busy}>
        <Sparkles size={15} />
        {busy ? 'L\'IA analyse tes dépenses… (jusqu\'à quelques minutes)' : 'Demander l\'avis de l\'IA d\'après mes dépenses'}
      </button>
      {error && <p className="text-xs text-warn">{error}</p>}
      {advice && (
        <div className="rounded-xl bg-primary/5 border border-primary/15 p-3 space-y-1.5">
          <p className="text-xs text-slate-400">
            D'après {advice.months.length > 1 ? `${advice.months.length} mois` : '1 mois'} de dépenses ({advice.months.map(monthLabel).join(', ')})
          </p>
          <p className="text-sm font-semibold text-slate-700">
            🤖 {BUDGET_RULES[advice.ruleId]?.label}, {advice.includeFixed ? 'avec' : 'sans'} les charges fixes
          </p>
          {advice.reasons.map(r => <p key={r} className="text-xs text-slate-600">• {r}</p>)}
          {advice.tip && <p className="text-xs text-slate-600">💡 {advice.tip}</p>}
          {advice.fallback && (
            <p className="text-[10px] text-slate-400">Réponse de l'IA inutilisable : méthode choisie d'après les chiffres seuls.</p>
          )}
          {alreadyApplied
            ? <p className="text-xs font-medium text-savings">✓ C'est ta méthode actuelle</p>
            : <button className="btn-primary w-full text-sm" onClick={apply}>Appliquer cette méthode</button>}
        </div>
      )}
    </div>
  );
}
