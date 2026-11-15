import { BUDGET_RULES } from '../utils/budget';

const RULE_DESCRIPTIONS = {
  '50-30-20': '50 % besoins · 30 % envies · 20 % épargne',
  '55-10-5-15-15': '55 % essentiel · 10 % plaisir · 5 % voyages · 15 % épargne court terme · 15 % long terme',
};

// Choix de la règle du « Budget idéal » et du calcul avec / sans charges fixes.
// recommended : { ruleId, includeFixed } pour afficher le badge « Conseillé »
export default function BudgetRulePicker({ ruleId, includeFixed, onChangeRule, onChangeIncludeFixed, recommended }) {
  return (
    <div className="space-y-2">
      {Object.entries(BUDGET_RULES).map(([id, rule]) => {
        const selected = ruleId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChangeRule(id)}
            className={`w-full text-left rounded-xl border-2 px-3 py-2.5 transition-colors ${
              selected ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700">{rule.label}</span>
              {recommended?.ruleId === id && (
                <span className="text-[10px] font-semibold text-savings bg-savings/10 px-1.5 py-0.5 rounded-full">Conseillé</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{RULE_DESCRIPTIONS[id]}</p>
          </button>
        );
      })}

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
