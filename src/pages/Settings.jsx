import { useState } from 'react';
import { ChevronRight, AlertTriangle, LogOut, Mail, Send } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { useAuth } from '../context/AuthContext';
import { REGIONS, ENVELOPE_CATEGORIES, generateId, getTobaccoType, tobaccoMonthlyBudget } from '../data/defaults';
import { SUPERMARKETS, getSupermarket } from '../data/supermarkets';
import { api } from '../api/client';
import { fmt } from '../utils/budget';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import TobaccoFields from '../components/TobaccoFields';

function Counter({ label, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-3">
        <button onClick={() => onChange(Math.max(0, value - 1))} className="w-8 h-8 rounded-full bg-slate-100 font-semibold hover:bg-slate-200" disabled={value <= 0}>−</button>
        <span className="w-5 text-center font-semibold text-slate-800">{value}</span>
        <button onClick={() => onChange(value + 1)} className="w-8 h-8 rounded-full bg-primary text-white font-semibold hover:bg-primary-dark">+</button>
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{children}</p>;
}

// Profil tabac : édition locale puis enregistrement, avec mise à jour optionnelle de l'enveloppe tabac
function TobaccoCard({ profile, envelopes, dispatch }) {
  const [draft, setDraft] = useState({
    tobaccoType: profile.tobaccoType,
    tobaccoPackPrice: profile.tobaccoPackPrice,
    tobaccoPacksPerWeek: profile.tobaccoPacksPerWeek,
  });
  const [saved, setSaved] = useState(false);
  const tobaccoEnv = envelopes.find(e => e.categoryId === 'tobacco');
  const monthly = tobaccoMonthlyBudget(draft);
  const dirty = draft.tobaccoType !== profile.tobaccoType
    || Number(draft.tobaccoPackPrice) !== Number(profile.tobaccoPackPrice)
    || Number(draft.tobaccoPacksPerWeek) !== Number(profile.tobaccoPacksPerWeek);

  function save(updateEnvelope) {
    const payload = {
      tobaccoType: draft.tobaccoType,
      tobaccoPackPrice: Number(draft.tobaccoPackPrice) || 0,
      tobaccoPacksPerWeek: Number(draft.tobaccoPacksPerWeek) || 0,
    };
    dispatch({ type: 'UPDATE_PROFILE', payload });
    if (updateEnvelope) {
      const budgetMonthly = Math.ceil(monthly / 5) * 5;
      if (tobaccoEnv) {
        dispatch({ type: 'UPDATE_ENVELOPE', payload: { ...tobaccoEnv, budgetMonthly } });
      } else {
        const cat = ENVELOPE_CATEGORIES.find(c => c.id === 'tobacco');
        dispatch({ type: 'ADD_ENVELOPE', payload: { id: generateId(), categoryId: 'tobacco', name: cat.name, icon: cat.icon, colorKey: cat.colorKey, type: cat.type, budgetMonthly } });
      }
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="card space-y-3">
      <SectionTitle>Tabac</SectionTitle>
      <TobaccoFields value={draft} onChange={patch => setDraft(d => ({ ...d, ...patch }))} />
      {tobaccoEnv && (
        <p className="text-xs text-slate-400">
          Enveloppe tabac actuelle : {fmt(tobaccoEnv.budgetMonthly)} / mois
          {' '}({Math.floor(tobaccoEnv.budgetMonthly / (Number(draft.tobaccoPackPrice) || 1))} {getTobaccoType(draft.tobaccoType).unitPlural})
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary text-sm py-2" disabled={!dirty} onClick={() => save(false)}>Enregistrer</button>
        <button className="btn-secondary text-sm py-2" onClick={() => save(true)}>
          {tobaccoEnv ? 'Enregistrer + ajuster l\'enveloppe' : 'Créer l\'enveloppe tabac'} ({fmt(Math.ceil(monthly / 5) * 5)})
        </button>
        {saved && <span className="text-xs text-savings self-center">✓ Enregistré</span>}
      </div>
    </div>
  );
}

function AlertsCard({ profile, dispatch }) {
  const [email, setEmail] = useState(profile.alertEmail || '');
  const [test, setTest] = useState(null);
  const update = payload => dispatch({ type: 'UPDATE_PROFILE', payload });

  async function sendTest() {
    setTest({ busy: true });
    try {
      const r = await api.post('/api/profile/test-email');
      setTest({ ok: true, text: `E-mail envoyé à ${r.to}` });
    } catch (err) {
      setTest({ ok: false, text: err.message });
    }
  }

  return (
    <div className="card">
      <SectionTitle>Alertes & e-mails</SectionTitle>
      {!profile.mailConfigured && (
        <p className="text-xs text-warn bg-warn/10 rounded-lg px-3 py-2 my-2">
          L'envoi d'e-mails n'est pas encore configuré sur le serveur (variables SMTP_* du fichier .env).
        </p>
      )}
      <Toggle
        label="🔔 Alertes d'enveloppes par e-mail"
        sub="Quand une enveloppe atteint le seuil, puis quand elle est dépassée. Tabac : quand il ne reste plus de quoi acheter un paquet."
        value={profile.alertsEnabled}
        onChange={v => update({ alertsEnabled: v })}
      />
      {profile.alertsEnabled && (
        <div className="flex items-center justify-between py-3 border-b border-slate-50">
          <span className="text-sm text-slate-600">Seuil d'alerte</span>
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {[70, 80, 90].map(t => (
              <button
                key={t}
                onClick={() => update({ alertThreshold: t })}
                className={`px-3 py-1 rounded-md text-xs font-semibold ${profile.alertThreshold === t ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
              >{t}%</button>
            ))}
          </div>
        </div>
      )}
      <Toggle
        label="🐷 Rappel de fin de mois"
        sub="Le dernier jour du mois, un e-mail pour enregistrer l'épargne réelle et le reste"
        value={profile.monthEndEmail}
        onChange={v => update({ monthEndEmail: v })}
      />
      <div className="pt-3 space-y-2">
        <label className="label flex items-center gap-1"><Mail size={12} /> Adresse de réception</label>
        <div className="flex gap-2">
          <input
            className="input"
            type="email"
            placeholder={profile.accountEmail || 'email@exemple.fr'}
            value={email}
            onChange={e => setEmail(e.target.value)}
            onBlur={() => email !== (profile.alertEmail || '') && update({ alertEmail: email })}
          />
          <button className="btn-secondary px-3 flex items-center gap-1 text-sm" onClick={sendTest} disabled={test?.busy || !profile.mailConfigured} title="Envoyer un e-mail de test">
            <Send size={14} /> Test
          </button>
        </div>
        <p className="text-[11px] text-slate-400">Vide = adresse du compte ({profile.accountEmail || '—'})</p>
        {test?.text && <p className={`text-xs ${test.ok ? 'text-savings' : 'text-danger'}`}>{test.text}</p>}
      </div>
    </div>
  );
}

function Row({ label, value, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between w-full py-3 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-800">{value}</span>
        <ChevronRight size={14} className="text-slate-300" />
      </div>
    </button>
  );
}

function Toggle({ label, sub, value, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-50 last:border-0">
      <div>
        <p className="text-sm text-slate-700 font-medium">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 flex-shrink-0 rounded-full transition-colors relative ${value ? 'bg-primary' : 'bg-slate-200'}`}
      >
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-6' : 'left-1'}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const { state, dispatch } = useBudget();
  const { logout } = useAuth();
  const { profile, envelopes } = state;
  const [editModal, setEditModal] = useState(null);
  const [resetModal, setResetModal] = useState(false);
  const [editVal, setEditVal] = useState('');

  function openEdit(field, current) {
    setEditModal(field);
    setEditVal(String(current));
  }

  function saveEdit() {
    if (!editModal) return;
    let val = editVal;
    if (['netSalary', 'householdAdults', 'householdChildren'].includes(editModal)) {
      val = Number(editVal);
    }
    dispatch({ type: 'UPDATE_PROFILE', payload: { [editModal]: val } });
    setEditModal(null);
  }

  const pets = { dogs: 0, cats: 0, other: 0, ...profile.pets };
  const setPet = (key, v) => dispatch({ type: 'UPDATE_PROFILE', payload: { pets: { ...pets, [key]: v } } });

  return (
    <div className="pt-6 pb-4 space-y-4">
      <PageHeader title="Profil" subtitle={profile.accountEmail || 'Tes informations et préférences'} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
      <div className="space-y-4">

      {/* Profile */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Profil</p>
        <Row label="Prénom" value={profile.firstName || '—'} onClick={() => openEdit('firstName', profile.firstName)} />
        <Row
          label="Salaire net mensuel"
          value={`${Number(profile.netSalary).toLocaleString('fr-FR')} €`}
          onClick={() => openEdit('netSalary', profile.netSalary)}
        />
        <Row label="Région" value={profile.region} onClick={() => openEdit('region', profile.region)} />
        <Row
          label="Supermarché habituel"
          value={`${getSupermarket(profile.supermarket)?.logo} ${getSupermarket(profile.supermarket)?.name}`}
          onClick={() => openEdit('supermarket', profile.supermarket || 'leclerc')}
        />
      </div>

      {/* Foyer */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Foyer</p>
        <Row
          label="Adultes"
          value={profile.householdAdults}
          onClick={() => openEdit('householdAdults', profile.householdAdults)}
        />
        <Row
          label="Enfants"
          value={profile.householdChildren}
          onClick={() => openEdit('householdChildren', profile.householdChildren)}
        />
        <Counter label="🐶 Chiens" value={pets.dogs} onChange={v => setPet('dogs', v)} />
        <Counter label="🐱 Chats" value={pets.cats} onChange={v => setPet('cats', v)} />
        <Counter label="🐹 Autres animaux" value={pets.other} onChange={v => setPet('other', v)} />
      </div>

      {/* Préférences */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Préférences</p>
        <Toggle
          label="🚗 J'ai une voiture"
          value={profile.hasCar}
          onChange={v => dispatch({ type: 'UPDATE_PROFILE', payload: { hasCar: v } })}
        />
        <Toggle
          label="🚬 Je fume"
          sub="Profil tabac, enveloppe et alerte dédiées"
          value={profile.isSmoker}
          onChange={v => dispatch({ type: 'UPDATE_PROFILE', payload: { isSmoker: v } })}
        />
      </div>
      </div>

      <div className="space-y-4">
      {profile.isSmoker && <TobaccoCard key={profile.tobaccoType} profile={profile} envelopes={envelopes} dispatch={dispatch} />}

      <AlertsCard profile={profile} dispatch={dispatch} />

      {/* Données */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Données</p>
        <button
          onClick={() => setResetModal(true)}
          className="btn-danger w-full flex items-center justify-center gap-2 mb-2"
        >
          <AlertTriangle size={16} /> Réinitialiser toutes les données
        </button>
        <button
          onClick={logout}
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <LogOut size={16} /> Se déconnecter
        </button>
      </div>

      {/* About */}
      <div className="card text-center py-5">
        <p className="text-2xl font-bold text-primary">MesSous</p>
        <p className="text-xs text-slate-400 mt-1">Budget enveloppes personnel</p>
        <p className="text-xs text-slate-300 mt-3">version {__APP_VERSION__.slice(0, 16).replace('T', ' ')}</p>
      </div>
      </div>
      </div>

      {/* Edit modal */}
      {editModal && (
        <Modal
          title="Modifier"
          onClose={() => setEditModal(null)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setEditModal(null)}>Annuler</button>
              <button className="btn-primary" onClick={saveEdit}>Enregistrer</button>
            </>
          }
        >
          {editModal === 'region' ? (
            <select className="input" value={editVal} onChange={e => setEditVal(e.target.value)}>
              {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : editModal === 'supermarket' ? (
            <div className="grid grid-cols-2 gap-2">
              {SUPERMARKETS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setEditVal(s.id)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                    editVal === s.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-slate-100 bg-white text-slate-700 hover:border-slate-200'
                  }`}
                >
                  <span>{s.logo}</span><span>{s.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <input
              className="input text-lg"
              type={['netSalary', 'householdAdults', 'householdChildren'].includes(editModal) ? 'number' : 'text'}
              value={editVal}
              onChange={e => setEditVal(e.target.value)}
              autoFocus
            />
          )}
        </Modal>
      )}

      {/* Reset confirmation */}
      {resetModal && (
        <Modal
          title="⚠️ Réinitialiser les données ?"
          onClose={() => setResetModal(false)}
          footer={
            <>
              <button className="btn-secondary" onClick={() => setResetModal(false)}>Annuler</button>
              <button
                className="btn-danger"
                onClick={() => { dispatch({ type: 'RESET' }); setResetModal(false); }}
              >
                Oui, tout supprimer
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Cette action supprimera définitivement toutes tes données : profil, charges, enveloppes et historique de dépenses.
          </p>
          <p className="text-sm font-semibold text-danger mt-2">Cette action est irréversible.</p>
        </Modal>
      )}
    </div>
  );
}
