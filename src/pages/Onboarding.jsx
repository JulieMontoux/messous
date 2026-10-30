import { useState } from 'react';
import { ChevronRight, ChevronLeft, Plus, Trash2, Check } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import {
  FIXED_CATEGORIES, REGIONS, generateId, suggestEnvelopes, defaultFixedCharges, ENVELOPE_CATEGORIES,
} from '../data/defaults';
import { SUPERMARKETS } from '../data/supermarkets';
import { fmt } from '../utils/budget';
import TobaccoFields from '../components/TobaccoFields';

const TOTAL_STEPS = 5;

function StepBar({ step }) {
  return (
    <div className="flex gap-1.5 mb-6">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-1.5 flex-1 rounded-full transition-colors ${
            i < step ? 'bg-primary' : i === step ? 'bg-primary/40' : 'bg-slate-200'
          }`}
        />
      ))}
    </div>
  );
}

function Counter({ value, onChange, min = 0, max = 10 }) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-lg font-semibold hover:bg-slate-200 transition-colors disabled:opacity-30"
        disabled={value <= min}
      >−</button>
      <span className="w-6 text-center font-semibold text-slate-800 text-lg">{value}</span>
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        className="w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center text-lg font-semibold hover:bg-primary-dark transition-colors disabled:opacity-30"
        disabled={value >= max}
      >+</button>
    </div>
  );
}

export default function Onboarding() {
  const { dispatch } = useBudget();
  const [step, setStep] = useState(0);

  const [profile, setProfile] = useState({
    firstName: '',
    netSalary: '',
    householdAdults: 1,
    householdChildren: 0,
    pets: { dogs: 0, cats: 0, other: 0 },
    isSmoker: false,
    tobaccoType: 'indus',
    tobaccoPackPrice: 13,
    tobaccoPacksPerWeek: 7,
    hasCar: true,
    region: 'Île-de-France',
  });

  const [charges, setCharges] = useState(defaultFixedCharges);
  const [envelopes, setEnvelopes] = useState([]);
  const [newCharge, setNewCharge] = useState({ name: '', categoryId: 'housing', amount: '' });
  const [showAddCharge, setShowAddCharge] = useState(false);

  const set = (key, val) => setProfile(p => ({ ...p, [key]: val }));
  const setPet = (pet, val) => setProfile(p => ({ ...p, pets: { ...p.pets, [pet]: val } }));

  function goNext() {
    if (step === 3) {
      // Generate envelope suggestions before showing step 4
      const salary = Number(profile.netSalary) || 0;
      const suggested = suggestEnvelopes({ ...profile, netSalary: salary });
      const activeCategories = ENVELOPE_CATEGORIES.filter(cat => {
        if (cat.id === 'fuel' && !profile.hasCar) return false;
        if (cat.id === 'car_maintenance' && !profile.hasCar) return false;
        if (cat.id === 'tobacco' && !profile.isSmoker) return false;
        if (cat.id === 'pets' && (profile.pets.dogs + profile.pets.cats + profile.pets.other) === 0) return false;
        if (cat.id === 'transport' && profile.hasCar) return false;
        return suggested[cat.id] !== 0;
      });
      const newEnvelopes = activeCategories.map(cat => ({
        id: generateId(),
        categoryId: cat.id,
        name: cat.name,
        icon: cat.icon,
        colorKey: cat.colorKey,
        type: cat.type,
        budgetMonthly: suggested[cat.id] || Math.round((Number(profile.netSalary) || 2000) * 0.05 / 10) * 10,
      }));
      setEnvelopes(newEnvelopes);
    }
    setStep(s => Math.min(TOTAL_STEPS - 1, s + 1));
  }

  function goBack() {
    setStep(s => Math.max(0, s - 1));
  }

  function finish() {
    dispatch({
      type: 'COMPLETE_ONBOARDING',
      payload: {
        profile: { ...profile, netSalary: Number(profile.netSalary) || 0 },
        fixedCharges: charges,
        envelopes,
      },
    });
  }

  function addCharge() {
    if (!newCharge.name || !newCharge.amount) return;
    setCharges(cs => [...cs, { ...newCharge, id: generateId(), amount: Number(newCharge.amount) }]);
    setNewCharge({ name: '', categoryId: 'housing', amount: '' });
    setShowAddCharge(false);
  }

  const salary = Number(profile.netSalary) || 0;
  const totalCharges = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const totalEnv = envelopes.reduce((s, e) => s + (Number(e.budgetMonthly) || 0), 0);
  const savings = salary - totalCharges - totalEnv;

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 flex flex-col items-center justify-start px-4 pt-10 pb-8">
      <div className="w-full max-w-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-2xl font-bold text-primary">MesSous</span>
          <span className="text-xs text-slate-400 font-medium">Étape {step + 1}/{TOTAL_STEPS}</span>
        </div>
        <StepBar step={step} />

        {/* Step 0: Identité + salaire */}
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Bienvenue 👋</h2>
              <p className="text-slate-500 mt-1 text-sm">En quelques étapes, on calcule ton budget personnalisé.</p>
            </div>
            <div>
              <label className="label">Ton prénom</label>
              <input
                className="input"
                placeholder="Ex. Julie"
                value={profile.firstName}
                onChange={e => set('firstName', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Salaire net mensuel (€)</label>
              <input
                className="input text-lg font-semibold"
                type="number"
                placeholder="Ex. 2200"
                value={profile.netSalary}
                onChange={e => set('netSalary', e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">Après impôts, ce que tu reçois chaque mois.</p>
            </div>
          </div>
        )}

        {/* Step 1: Foyer */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Ton foyer 🏠</h2>
              <p className="text-slate-500 mt-1 text-sm">Ces infos servent à estimer tes besoins réels.</p>
            </div>
            <div className="card space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-700">Adultes</p>
                  <p className="text-xs text-slate-400">Dont toi</p>
                </div>
                <Counter value={profile.householdAdults} onChange={v => set('householdAdults', v)} min={1} max={6} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-700">Enfants</p>
                  <p className="text-xs text-slate-400">À charge</p>
                </div>
                <Counter value={profile.householdChildren} onChange={v => set('householdChildren', v)} />
              </div>
            </div>
            <div>
              <p className="label">Animaux de compagnie</p>
              <div className="card space-y-3">
                {[
                  { key: 'dogs', label: '🐶 Chiens', sub: '~80€/mois' },
                  { key: 'cats', label: '🐱 Chats', sub: '~50€/mois' },
                  { key: 'other', label: '🐹 Autres', sub: '~25€/mois' },
                ].map(({ key, label, sub }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-slate-700">{label}</p>
                      <p className="text-xs text-slate-400">{sub}</p>
                    </div>
                    <Counter value={profile.pets[key]} onChange={v => setPet(key, v)} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Profil dépenses */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Ton profil 🎯</h2>
              <p className="text-slate-500 mt-1 text-sm">Pour affiner les suggestions de budget.</p>
            </div>
            <div className="card space-y-4">
              {[
                { key: 'hasCar', label: '🚗 J\'ai une voiture', sub: 'Active l\'enveloppe essence' },
                { key: 'isSmoker', label: '🚬 Je fume', sub: 'Active l\'enveloppe tabac' },
              ].map(({ key, label, sub }) => (
                <button
                  key={key}
                  onClick={() => set(key, !profile[key])}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div>
                    <p className="font-medium text-slate-700">{label}</p>
                    <p className="text-xs text-slate-400">{sub}</p>
                  </div>
                  <div className={`w-11 h-6 rounded-full transition-colors relative ${profile[key] ? 'bg-primary' : 'bg-slate-200'}`}>
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${profile[key] ? 'left-6' : 'left-1'}`} />
                  </div>
                </button>
              ))}
            </div>
            {profile.isSmoker && (
              <div className="card">
                <p className="font-medium text-slate-700 mb-3">🚬 Ce que tu fumes</p>
                <TobaccoFields value={profile} onChange={patch => setProfile(p => ({ ...p, ...patch }))} />
              </div>
            )}
            <div>
              <label className="label">Supermarché habituel</label>
              <p className="text-xs text-slate-400 mb-2">Sert à estimer ton budget courses</p>
              <div className="grid grid-cols-2 gap-2">
                {SUPERMARKETS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => set('supermarket', s.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                      profile.supermarket === s.id
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200'
                    }`}
                  >
                    <span>{s.logo}</span>
                    <span>{s.name}</span>
                  </button>
                ))}
              </div>
              {profile.supermarket && (
                <p className="text-xs text-slate-400 mt-2">
                  {SUPERMARKETS.find(s => s.id === profile.supermarket)?.tip}
                </p>
              )}
            </div>
            <div>
              <label className="label">Région</label>
              <select
                className="input"
                value={profile.region}
                onChange={e => set('region', e.target.value)}
              >
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Step 3: Charges fixes */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Charges fixes 📋</h2>
              <p className="text-slate-500 mt-1 text-sm">Ce qui sort chaque mois, quoi qu'il arrive.</p>
            </div>
            <div className="space-y-2">
              {charges.map(c => {
                const cat = FIXED_CATEGORIES.find(x => x.id === c.categoryId);
                return (
                  <div key={c.id} className="card flex items-center gap-3 py-3">
                    <span className="text-xl">{cat?.icon || '📌'}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-700 text-sm truncate">{c.name}</p>
                      <p className="text-xs text-slate-400">{cat?.name}</p>
                    </div>
                    <input
                      type="number"
                      className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      value={c.amount}
                      onChange={e => setCharges(cs => cs.map(x => x.id === c.id ? { ...x, amount: Number(e.target.value) } : x))}
                    />
                    <span className="text-xs text-slate-400">€</span>
                    <button onClick={() => setCharges(cs => cs.filter(x => x.id !== c.id))} className="p-1.5 text-slate-300 hover:text-danger transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })}
            </div>

            {showAddCharge ? (
              <div className="card space-y-3">
                <input className="input" placeholder="Nom (ex. Crédit voiture)" value={newCharge.name} onChange={e => setNewCharge(n => ({ ...n, name: e.target.value }))} />
                <div className="flex gap-2">
                  <select className="input flex-1" value={newCharge.categoryId} onChange={e => setNewCharge(n => ({ ...n, categoryId: e.target.value }))}>
                    {FIXED_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                  </select>
                  <input type="number" className="input w-24" placeholder="Montant" value={newCharge.amount} onChange={e => setNewCharge(n => ({ ...n, amount: e.target.value }))} />
                </div>
                <div className="flex gap-2">
                  <button className="btn-primary flex-1" onClick={addCharge}>Ajouter</button>
                  <button className="btn-secondary" onClick={() => setShowAddCharge(false)}>Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddCharge(true)} className="flex items-center gap-2 text-primary font-medium text-sm hover:text-primary-dark">
                <Plus size={16} /> Ajouter une charge
              </button>
            )}

            <div className="card bg-slate-50 border-slate-200">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Total charges fixes</span>
                <span className="font-bold text-slate-800">{fmt(totalCharges)}</span>
              </div>
              {salary > 0 && (
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-slate-500">Reste pour enveloppes + épargne</span>
                  <span className={`font-bold ${salary - totalCharges < 0 ? 'text-danger' : 'text-savings'}`}>
                    {fmt(salary - totalCharges)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 4: Enveloppes */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Enveloppes 👛</h2>
              <p className="text-slate-500 mt-1 text-sm">Ajuste les montants suggérés selon tes habitudes.</p>
            </div>

            <div className="space-y-2">
              {envelopes.map(env => (
                <div key={env.id} className="card flex items-center gap-3 py-3">
                  <span className="text-xl">{env.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-700 text-sm">{env.name}</p>
                    <p className="text-xs text-slate-400">{env.type === 'need' ? 'Besoin' : 'Envie'}</p>
                  </div>
                  <input
                    type="number"
                    className="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                    value={env.budgetMonthly}
                    onChange={e => setEnvelopes(es => es.map(x => x.id === env.id ? { ...x, budgetMonthly: Number(e.target.value) } : x))}
                  />
                  <span className="text-xs text-slate-400">€</span>
                </div>
              ))}
            </div>

            <div className={`card border-2 ${savings >= 0 ? 'border-savings/30 bg-savings/5' : 'border-danger/30 bg-danger/5'}`}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500">Charges fixes</span>
                <span className="font-medium">{fmt(totalCharges)}</span>
              </div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-500">Enveloppes</span>
                <span className="font-medium">{fmt(totalEnv)}</span>
              </div>
              <div className="border-t border-slate-100 mt-2 pt-2 flex justify-between">
                <span className="font-semibold text-slate-700">Épargne disponible</span>
                <span className={`font-bold text-lg ${savings >= 0 ? 'text-savings' : 'text-danger'}`}>
                  {fmt(savings)}
                </span>
              </div>
              {salary > 0 && (
                <p className="text-xs text-slate-400 mt-1 text-right">
                  {Math.round((savings / salary) * 100)}% du salaire
                </p>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button onClick={goBack} className="btn-secondary flex items-center gap-1">
              <ChevronLeft size={18} /> Retour
            </button>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <button
              onClick={goNext}
              className="btn-primary flex-1 flex items-center justify-center gap-1"
              disabled={step === 0 && (!profile.firstName || !profile.netSalary)}
            >
              Continuer <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={finish}
              className="btn-primary flex-1 flex items-center justify-center gap-2"
            >
              <Check size={18} /> C'est parti !
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
