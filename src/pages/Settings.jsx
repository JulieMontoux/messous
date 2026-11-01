import { useEffect, useState } from 'react';
import { pushSupported, currentSubscription, enablePush, disablePush } from '../utils/push';
import { ChevronRight, AlertTriangle, LogOut, Mail, Send, Download } from 'lucide-react';
import { useBudget } from '../context/BudgetContext';
import { useAuth } from '../context/AuthContext';
import { REGIONS, ENVELOPE_CATEGORIES, generateId, getTobaccoType, tobaccoMonthlyBudget } from '../data/defaults';
import { SUPERMARKETS, getSupermarket } from '../data/supermarkets';
import { api } from '../api/client';
import { fmt } from '../utils/budget';
import { monthKey } from '../utils/period';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import TobaccoFields from '../components/TobaccoFields';
import AccountCard from '../components/AccountCard';

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
      <QuitTobacco profile={profile} tobaccoEnv={tobaccoEnv} dispatch={dispatch} />
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

// Suppression réelle de toutes les données côté serveur (compte conservé), après mot de passe
function ResetModal({ onClose, onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = password && confirm.trim().toUpperCase() === 'SUPPRIMER';

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api.post('/api/profile/reset', { password });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="⚠️ Réinitialiser toutes les données ?"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-danger" disabled={!ready || busy} onClick={submit}>
            {busy ? 'Suppression…' : 'Tout supprimer'}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">
        Supprime définitivement sur le serveur : profil, charges, enveloppes, dépenses, retraits, historique,
        objectifs, opérations et connexions bancaires. Ton compte (e-mail et mot de passe) est conservé et tu repars
        de l'écran de démarrage.
      </p>
      <p className="text-xs text-slate-500">
        Les sauvegardes quotidiennes du serveur permettent de revenir en arrière (voir README → Restaurer).
      </p>
      <div>
        <label className="label">Ton mot de passe</label>
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div>
        <label className="label">Tape SUPPRIMER pour confirmer</label>
        <input className="input" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="SUPPRIMER" />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Modal>
  );
}

function formatMonthFr(yyyyMM) {
  const [y, m] = yyyyMM.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// Salaire avec date d'effet : immédiat ou à partir d'un mois futur (appliqué automatiquement)
function SalaryModal({ profile, dispatch, onClose }) {
  const now = new Date();
  const nextMonth = monthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const [amount, setAmount] = useState(profile.nextSalary ?? profile.netSalary);
  const [when, setWhen] = useState(profile.nextSalaryFrom ? 'custom' : 'now');
  const [custom, setCustom] = useState(profile.nextSalaryFrom || nextMonth);
  const [error, setError] = useState('');
  const from = when === 'now' ? monthKey() : when === 'next' ? nextMonth : custom;

  async function save() {
    try {
      const updated = await api.put('/api/profile/salary', { amount: Number(amount), from });
      dispatch({ type: 'SET_PROFILE', payload: updated });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Modal
      title="Salaire net mensuel"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={save} disabled={!(Number(amount) >= 0) || amount === ''}>Enregistrer</button>
        </>
      }
    >
      <input className="input text-lg" type="number" value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
      <div>
        <label className="label">À partir de</label>
        <div className="grid grid-cols-3 bg-slate-100 rounded-xl p-1 gap-1">
          {[{ id: 'now', label: 'Ce mois-ci' }, { id: 'next', label: 'Mois prochain' }, { id: 'custom', label: 'Autre mois' }].map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => setWhen(o.id)}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${when === o.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
            >{o.label}</button>
          ))}
        </div>
        {when === 'custom' && (
          <input className="input mt-2" type="month" min={monthKey()} value={custom} onChange={e => setCustom(e.target.value)} />
        )}
      </div>
      <p className="text-xs text-slate-500">
        {from <= monthKey()
          ? 'Appliqué tout de suite, y compris au mois en cours. Les mois passés ne changent pas.'
          : `Appliqué automatiquement à partir de ${formatMonthFr(from)} : ${formatMonthFr(monthKey())} garde le salaire actuel (${fmt(profile.netSalary)}).`}
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
    </Modal>
  );
}

// Répartition du budget idéal (besoins / plaisirs / épargne), total 100 %
function IdealSplitCard({ profile, dispatch }) {
  const [draft, setDraft] = useState({
    idealNeedsPct: profile.idealNeedsPct ?? 50,
    idealWantsPct: profile.idealWantsPct ?? 30,
    idealSavingsPct: profile.idealSavingsPct ?? 20,
  });
  const total = Number(draft.idealNeedsPct) + Number(draft.idealWantsPct) + Number(draft.idealSavingsPct);
  const dirty = ['idealNeedsPct', 'idealWantsPct', 'idealSavingsPct'].some(k => Number(draft[k]) !== Number(profile[k] ?? { idealNeedsPct: 50, idealWantsPct: 30, idealSavingsPct: 20 }[k]));
  const fields = [
    { key: 'idealNeedsPct', label: '🧾 Besoins' },
    { key: 'idealWantsPct', label: '🎉 Plaisirs' },
    { key: 'idealSavingsPct', label: '🏦 Épargne' },
  ];

  return (
    <div className="card space-y-3">
      <SectionTitle>Budget idéal</SectionTitle>
      <p className="text-xs text-slate-400 -mt-2">Répartition de ce qui reste après les charges fixes (règle 50/30/20 par défaut).</p>
      <div className="grid grid-cols-3 gap-2">
        {fields.map(f => (
          <div key={f.key}>
            <label className="label">{f.label}</label>
            <div className="relative">
              <input
                className="input pr-7"
                type="number"
                min="0"
                max="100"
                value={draft[f.key]}
                onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value === '' ? '' : Number(e.target.value) }))}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${total === 100 ? 'text-savings' : 'text-danger'}`}>Total : {total} %{total !== 100 && ' (doit faire 100 %)'}</span>
        <div className="flex gap-2">
          <button className="btn-secondary text-xs py-1.5" onClick={() => setDraft({ idealNeedsPct: 50, idealWantsPct: 30, idealSavingsPct: 20 })}>50/30/20</button>
          <button
            className="btn-primary text-xs py-1.5"
            disabled={total !== 100 || !dirty}
            onClick={() => dispatch({ type: 'UPDATE_PROFILE', payload: draft })}
          >Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// Mode « j'arrête » : compteur de jours et d'économies, enveloppe tabac remise à zéro si souhaité
function QuitTobacco({ profile, tobaccoEnv, dispatch }) {
  if (profile.tobaccoQuitDate) {
    const days = Math.max(0, Math.round((new Date() - new Date(`${String(profile.tobaccoQuitDate).slice(0, 10)}T00:00:00`)) / 86400000));
    const saved = Math.round(days * ((Number(profile.tobaccoPacksPerWeek) || 0) / 7) * (Number(profile.tobaccoPackPrice) || 0));
    return (
      <div className="rounded-xl bg-savings/10 px-3 py-2.5 flex items-center justify-between gap-2">
        <p className="text-sm text-savings font-medium">🎉 {days} jour{days > 1 ? 's' : ''} sans tabac · {fmt(saved)} économisés</p>
        <button
          className="text-xs text-slate-400 hover:text-slate-600 flex-shrink-0"
          onClick={() => dispatch({ type: 'UPDATE_PROFILE', payload: { tobaccoQuitDate: '' } })}
        >J'ai repris</button>
      </div>
    );
  }
  return (
    <button
      className="w-full rounded-xl border-2 border-dashed border-savings/40 text-savings text-sm font-medium py-2 hover:bg-savings/5"
      onClick={() => {
        dispatch({ type: 'UPDATE_PROFILE', payload: { tobaccoQuitDate: new Date().toISOString().slice(0, 10) } });
        if (tobaccoEnv && tobaccoEnv.budgetMonthly > 0 && window.confirm('Mettre l\'enveloppe tabac à 0 € ? (l\'argent économisé reste dans ton budget)')) {
          dispatch({ type: 'UPDATE_ENVELOPE', payload: { ...tobaccoEnv, budgetMonthly: 0 } });
        }
      }}
    >
      🚭 J'arrête de fumer — lancer le compteur
    </button>
  );
}

// Notifications push sur cet appareil (téléphone : app installée sur l'écran d'accueil)
function PushToggle() {
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();

  useEffect(() => {
    if (supported) currentSubscription().then(s => setOn(!!s)).catch(() => {});
  }, [supported]);

  async function toggle(v) {
    setBusy(true);
    setMsg(null);
    try {
      if (v) {
        await enablePush();
        await api.post('/api/push/test');
        setMsg({ ok: true, text: 'Notification de test envoyée ✅' });
      } else {
        await disablePush();
      }
      setOn(v);
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
    setBusy(false);
  }

  if (!supported) {
    return (
      <p className="text-xs text-slate-400 py-3 border-b border-slate-50">
        📱 Notifications : non disponibles dans ce navigateur. Sur iPhone, installe d'abord l'app
        (Partager → « Sur l'écran d'accueil ») puis ouvre-la depuis l'icône.
      </p>
    );
  }
  return (
    <>
      <Toggle
        label="📱 Notifications sur cet appareil"
        sub="Mêmes alertes que par e-mail (enveloppes, fin de mois, bilan, banque), directement sur l'écran"
        value={on}
        onChange={v => !busy && toggle(v)}
      />
      {msg && <p className={`text-xs pb-2 ${msg.ok ? 'text-savings' : 'text-danger'}`}>{msg.text}</p>}
    </>
  );
}

const EXPORTS = [
  { kind: 'depenses', label: 'Dépenses' },
  { kind: 'banque', label: 'Opérations bancaires' },
  { kind: 'historique', label: 'Historique mensuel' },
  { kind: 'charges', label: 'Charges fixes' },
  { kind: 'retraits', label: 'Retraits' },
  { kind: 'avances', label: 'Avances' },
];

// Export CSV (s'ouvre directement dans Excel / Numbers / LibreOffice)
function ExportButtons() {
  const [error, setError] = useState('');
  async function run(kind) {
    setError('');
    try {
      await api.download(`/api/export/${kind}.csv`, `messous-${kind}-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <div className="mb-3">
      <p className="text-xs text-slate-500 mb-2">Exporter en CSV (Excel, Numbers…)</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {EXPORTS.map(e => (
          <button key={e.kind} onClick={() => run(e.kind)} className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5">
            <Download size={13} /> {e.label}
          </button>
        ))}
      </div>
      {error && <p className="text-xs text-danger mt-1">{error}</p>}
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
      <SectionTitle>Alertes & notifications</SectionTitle>
      {!profile.mailConfigured && (
        <p className="text-xs text-warn bg-warn/10 rounded-lg px-3 py-2 my-2">
          L'envoi d'e-mails n'est pas encore configuré sur le serveur (variables SMTP_* du fichier .env).
        </p>
      )}
      <PushToggle />
      <Toggle
        label="🔔 Alertes d'enveloppes"
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
        label="📊 Bilan mensuel"
        sub="Le 1er du mois : dépenses par enveloppe, dépassements, épargne et comparaison avec le mois d'avant"
        value={profile.monthlyReportEmail !== false}
        onChange={v => update({ monthlyReportEmail: v })}
      />
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
        <div className={`absolute top-1 knob w-4 h-4 bg-white rounded-full shadow transition-all ${value ? 'left-6' : 'left-1'}`} />
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
  const [salaryOpen, setSalaryOpen] = useState(false);

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
          onClick={() => setSalaryOpen(true)}
        />
        {profile.nextSalary != null && profile.nextSalaryFrom && (
          <div className="flex items-center justify-between text-xs bg-primary/5 text-primary rounded-lg px-3 py-2 -mt-1 mb-1">
            <span>→ {fmt(profile.nextSalary)} à partir de {formatMonthFr(profile.nextSalaryFrom)}</span>
            <button
              className="text-slate-400 hover:text-danger"
              onClick={async () => {
                await api.delete('/api/profile/salary/pending');
                dispatch({ type: 'SET_PROFILE', payload: { nextSalary: null, nextSalaryFrom: null } });
              }}
            >Annuler</button>
          </div>
        )}
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
        <div className="flex items-center justify-between gap-3 py-3 border-b border-slate-50">
          <span className="text-sm text-slate-700 font-medium">🌓 Thème</span>
          <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
            {[{ id: 'auto', label: 'Auto' }, { id: 'light', label: 'Clair' }, { id: 'dark', label: 'Sombre' }].map(t => (
              <button
                key={t.id}
                onClick={() => dispatch({ type: 'UPDATE_PROFILE', payload: { theme: t.id } })}
                className={`px-3 py-1 rounded-md text-xs font-semibold ${(profile.theme || 'auto') === t.id ? 'bg-white text-primary shadow-sm' : 'text-slate-500'}`}
              >{t.label}</button>
            ))}
          </div>
        </div>
        <Toggle
          label="💶 Arrondir les retraits à la dizaine"
          sub="Pas de billets de 5 € au distributeur : 17 € → 20 €. Sinon, montants exacts à l'euro près."
          value={profile.roundWithdrawals !== false}
          onChange={v => dispatch({ type: 'UPDATE_PROFILE', payload: { roundWithdrawals: v } })}
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
      {profile.isSmoker && <TobaccoCard profile={profile} envelopes={envelopes} dispatch={dispatch} />}

      <IdealSplitCard profile={profile} dispatch={dispatch} />

      <AlertsCard profile={profile} dispatch={dispatch} />

      <AccountCard email={profile.accountEmail} />

      {/* Données */}
      <div className="card">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Données</p>
        <ExportButtons />
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

      {salaryOpen && <SalaryModal profile={profile} dispatch={dispatch} onClose={() => setSalaryOpen(false)} />}

      {/* Reset confirmation */}
      {resetModal && <ResetModal onClose={() => setResetModal(false)} onDone={() => { setResetModal(false); dispatch({ type: 'RESET' }); }} />}
    </div>
  );
}
