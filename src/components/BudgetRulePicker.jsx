import { useState } from 'react';
import { BUDGET_RULES, fmt } from '../utils/budget';

// Choix de la règle du « Budget idéal » et du calcul avec / sans charges fixes.
// recommended : { ruleId, includeFixed } pour afficher le badge « Conseillé »
// savingsGoal / onChangeSavingsGoal / defaultGoal : objectif d'épargne Kakeibo (€ par mois)
export default function BudgetRulePicker({
  ruleId, includeFixed, onChangeRule, onChangeIncludeFixed, recommended,
  savingsGoal, onChangeSavingsGoal, defaultGoal,
}) {
  const [goalDraft, setGoalDraft] = useState(savingsGoal ? String(savingsGoal) : '');

  return (
    <div className="space-y-2">
      {Object.entries(BUDGET_RULES).map(([id, rule]) => {
        const selected = ruleId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChangeRule(id)}
            className={`w-full text-left rounded-xl border-2 px-3 py-2 transition-colors ${
              selected ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700">{rule.label}</span>
              {recommended?.ruleId === id && (
                <span className="text-[10px] font-semibold text-savings bg-savings/10 px-1.5 py-0.5 rounded-full">Conseillé</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{rule.description}</p>
          </button>
        );
      })}

      {ruleId === 'kakeibo' && onChangeSavingsGoal && (
        <div className="pt-2">
          <label className="label">🏦 Objectif d'épargne Kakeibo (par mois)</label>
          <input
            className="input"
            type="number"
            min="0"
            placeholder={defaultGoal ? `${Math.round(defaultGoal)} (10 % par défaut)` : '10 % par défaut'}
            value={goalDraft}
            onChange={e => setGoalDraft(e.target.value)}
            onBlur={() => Number(goalDraft) !== Number(savingsGoal || 0) && onChangeSavingsGoal(Number(goalDraft) || 0)}
          />
          {!Number(goalDraft) && defaultGoal > 0 && (
            <p className="text-xs text-slate-400 mt-1">Sans montant, l'objectif est de {fmt(defaultGoal)} (10 %).</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2">
        <div>
          <p className="text-sm text-slate-700 font-medium">
            🧮 Compter les charges fixes
            {recommended && recommended.includeFixed === includeFixed && (
              <span className="ml-1.5 text-[10px] font-semibold text-savings bg-savings/10 px-1.5 py-0.5 rounded-full">Conseillé</span>
            )}
          </p>
          <p className="text-xs text-slate-400">
            {includeFixed
              ? 'Calcul sur le salaire entier, charges fixes comptées dans les besoins'
              : 'Calcul sur le salaire moins les charges fixes'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onChangeIncludeFixed(!includeFixed)}
          className={`w-11 h-6 flex-shrink-0 rounded-full transition-colors relative ${includeFixed ? 'bg-primary' : 'bg-slate-200'}`}
        >
          <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${includeFixed ? 'left-6' : 'left-1'}`} />
        </button>
      </div>
    </div>
  );
}
