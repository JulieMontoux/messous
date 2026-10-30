import { FIXED_CATEGORIES, MONTHS_FR as MONTHS } from '../data/defaults';
import { fmt, weeklyToMonthly, monthlyAmount } from '../utils/budget';

// « weekly » n'est qu'une aide à la saisie : converti en mensuel à l'enregistrement
const FREQ_OPTIONS = [
  { id: 'monthly', label: 'Mensuel' },
  { id: 'quarterly', label: 'Trimestriel' },
  { id: 'yearly', label: 'Annuel' },
  { id: 'weekly', label: 'Hebdo' },
];
// Formulaire de charge fixe, partagé avec la page Banque (création depuis un paiement)
export default function ChargeForm({ form, setForm }) {
  const freq = form.frequency;
  return (
    <>
      <div>
        <label className="label">Nom</label>
        <input className="input" placeholder="Ex. Loyer, EDF, Netflix…" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div>
        <label className="label">Catégorie</label>
        <select className="input" value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
          {FIXED_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">Fréquence</label>
        <div className="grid grid-cols-4 bg-slate-100 rounded-xl p-1 gap-1">
          {FREQ_OPTIONS.map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setForm(fm => ({ ...fm, frequency: f.id }))}
              className={`py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors ${freq === f.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className={freq === 'yearly' || freq === 'quarterly' ? 'grid grid-cols-2 gap-3' : ''}>
        <div>
          <label className="label">
            Montant {{ weekly: 'par semaine', monthly: 'par mois', quarterly: 'par trimestre', yearly: 'par an' }[freq]} (€)
          </label>
          <input
            className="input text-lg font-semibold"
            type="number"
            placeholder={{ weekly: 'Ex. 70', monthly: 'Ex. 700', quarterly: 'Ex. 90', yearly: 'Ex. 120' }[freq]}
            value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          />
        </div>
        {(freq === 'yearly' || freq === 'quarterly') && (
          <div>
            <label className="label">{freq === 'yearly' ? 'Prélevé en' : '1re échéance'}</label>
            <select className="input text-lg" value={form.dueMonth} onChange={e => setForm(f => ({ ...f, dueMonth: Number(e.target.value) }))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}
      </div>
      {form.amount && freq !== 'monthly' && (
        <p className="text-xs text-slate-400 -mt-2">
          = <strong>{fmt(freq === 'weekly' ? weeklyToMonthly(Number(form.amount)) : monthlyAmount({ amount: form.amount, frequency: freq }))}</strong> / mois dans le budget
          {freq === 'yearly' && ' (1/12 mis de côté chaque mois)'}
          {freq === 'quarterly' && ' (1/3 mis de côté chaque mois)'}
        </p>
      )}
    </>
  );
}

