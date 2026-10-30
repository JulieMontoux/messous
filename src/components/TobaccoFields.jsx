import { TOBACCO_TYPES, getTobaccoType, tobaccoMonthlyBudget } from '../data/defaults';
import { fmt } from '../utils/budget';
import { cn } from '../lib/utils';

// Choix du type de tabac (roulé / tubé / industriel), prix unitaire et consommation
export default function TobaccoFields({ value, onChange }) {
  const type = getTobaccoType(value.tobaccoType);

  function selectType(t) {
    // Nouveau type → prix/consommation par défaut du type (modifiables ensuite)
    onChange({ tobaccoType: t.id, tobaccoPackPrice: t.defaultPrice, tobaccoPacksPerWeek: t.defaultPerWeek });
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {TOBACCO_TYPES.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => selectType(t)}
            className={cn(
              'flex flex-col items-center gap-1 px-2 py-3 rounded-xl border-2 text-xs font-semibold transition-colors',
              value.tobaccoType === t.id ? 'border-primary bg-primary/5 text-primary' : 'border-slate-100 bg-white text-slate-600 hover:border-slate-200'
            )}
          >
            <span className="text-xl">{t.icon}</span>
            {t.short}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Prix / {type.unit}</label>
          <input
            className="input"
            type="number"
            step="0.1"
            min="0"
            value={value.tobaccoPackPrice}
            onChange={e => onChange({ tobaccoPackPrice: e.target.value === '' ? '' : Number(e.target.value) })}
          />
        </div>
        <div>
          <label className="label">{type.unitPlural} / semaine</label>
          <input
            className="input"
            type="number"
            step="0.5"
            min="0"
            value={value.tobaccoPacksPerWeek}
            onChange={e => onChange({ tobaccoPacksPerWeek: e.target.value === '' ? '' : Number(e.target.value) })}
          />
        </div>
      </div>
      <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2">
        Budget tabac estimé : <strong className="text-slate-700">{fmt(tobaccoMonthlyBudget(value))} / mois</strong>
      </p>
    </div>
  );
}
