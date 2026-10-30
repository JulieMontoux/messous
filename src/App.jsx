import { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { BudgetProvider } from './context/BudgetContext';
import { useBudget } from './context/BudgetContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Charges from './pages/Charges';
import Envelopes from './pages/Envelopes';
import Goals from './pages/Goals';
import Suggestions from './pages/Suggestions';
import Settings from './pages/Settings';
import History from './pages/History';
import Bank from './pages/Bank';
import { api, fetchAll } from './api/client';
import {
  totalFixed as getTotalFixed,
  totalProgrammedSavings,
  totalVariableEnvelopes,
  totalSavingEnvelopesBudget,
  computedSavings,
  totalSavings as getTotalSavings,
} from './utils/budget';

const LEGACY_KEY = 'messous_v1';

const PAGES = {
  dashboard: Dashboard,
  charges: Charges,
  envelopes: Envelopes,
  goals: Goals,
  suggestions: Suggestions,
  history: History,
  bank: Bank,
  settings: Settings,
};

// Page initiale lue dans l'URL (liens des e-mails : /?page=history&close=2026-10)
function readUrlParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

function parseLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.profile?.onboardingDone) return null;
    return data;
  } catch { return null; }
}

function MigrationScreen({ onDone }) {
  const legacy = parseLegacy();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');

  if (!legacy) { onDone(); return null; }

  const count = (legacy.fixedCharges?.length || 0) + (legacy.envelopes?.length || 0) + (legacy.transactions?.length || 0);

  async function doMigrate() {
    setStatus('importing');
    setError('');
    try {
      const { profile, fixedCharges = [], envelopes = [], transactions = [], savingsHistory = [], settings } = legacy;

      await api.put('/api/profile', {
        firstName: profile.firstName, netSalary: profile.netSalary, hasCar: profile.hasCar,
        isSmoker: profile.isSmoker, householdAdults: profile.householdAdults,
        householdChildren: profile.householdChildren, pets: profile.pets,
        region: profile.region, supermarket: profile.supermarket,
        registrationDate: profile.registrationDate, onboardingDone: true,
      });

      if (settings?.viewMode) await api.put('/api/settings', { viewMode: settings.viewMode });

      for (const c of fixedCharges)
        await api.post('/api/charges', { id: c.id, name: c.name, amount: c.amount, categoryId: c.categoryId, icon: c.icon });

      for (const e of envelopes)
        await api.post('/api/envelopes', { id: e.id, name: e.name, categoryId: e.categoryId, icon: e.icon, colorKey: e.colorKey, type: e.type, budgetMonthly: e.budgetMonthly });

      for (const t of transactions)
        await api.post('/api/transactions', { id: t.id, envelopeId: t.envelopeId, amount: t.amount, note: t.note, date: t.date });

      for (const s of savingsHistory)
        await api.put(`/api/savings/${s.month}`, s);

      localStorage.removeItem(LEGACY_KEY);
      onDone();
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-5xl mb-3">📦</p>
          <h1 className="text-2xl font-bold text-slate-800">Données trouvées</h1>
          <p className="text-sm text-slate-400 mt-2">
            On a détecté tes données de l'ancienne version
          </p>
        </div>
        <div className="card space-y-4">
          <div className="bg-slate-50 rounded-xl p-4 space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Charges fixes</span>
              <span className="font-semibold text-slate-700">{legacy.fixedCharges?.length || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Enveloppes</span>
              <span className="font-semibold text-slate-700">{legacy.envelopes?.length || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Dépenses</span>
              <span className="font-semibold text-slate-700">{legacy.transactions?.length || 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Mois historique</span>
              <span className="font-semibold text-slate-700">{legacy.savingsHistory?.length || 0}</span>
            </div>
          </div>
          {error && <p className="text-sm text-danger font-medium">{error}</p>}
          <button className="btn-primary w-full" onClick={doMigrate} disabled={status === 'importing'}>
            {status === 'importing' ? 'Import en cours…' : `Importer ${count} éléments`}
          </button>
          <button className="btn-secondary w-full" onClick={() => { localStorage.removeItem(LEGACY_KEY); onDone(); }}>
            Ignorer et repartir à zéro
          </button>
        </div>
      </div>
    </div>
  );
}

function BudgetApp() {
  const { state, dispatch, ready, loadError, reload } = useBudget();
  const { logout } = useAuth();
  const [params, setParams] = useState(readUrlParams);
  const [page, setPageState] = useState(() => (PAGES[params.page] ? params.page : 'dashboard'));

  function setPage(next, nextParams = {}) {
    setPageState(next);
    setParams(nextParams);
    const qs = new URLSearchParams({ page: next, ...nextParams }).toString();
    window.history.replaceState(null, '', `?${qs}`);
    window.scrollTo(0, 0);
  }
  const [migrating, setMigrating] = useState(() => !!parseLegacy());
  const { profile, fixedCharges, envelopes } = state;

  useEffect(() => {
    if (!ready || !profile.onboardingDone) return;
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const salary = profile.netSalary;
    const rem = computedSavings(salary, fixedCharges, envelopes);
    dispatch({
      type: 'UPSERT_MONTH_SNAPSHOT',
      payload: {
        month, salary,
        totalFixed: getTotalFixed(fixedCharges),
        totalEnvelopes: totalVariableEnvelopes(envelopes),
        programmedSavings: totalProgrammedSavings(fixedCharges),
        savingEnvelopes: totalSavingEnvelopesBudget(envelopes),
        remainder: Math.max(0, rem),
        totalSavings: getTotalSavings(salary, fixedCharges, envelopes),
        recordedAt: now.toISOString(),
      },
    });
  }, [ready, profile.netSalary, profile.onboardingDone, fixedCharges, envelopes]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="card w-full max-w-sm text-center space-y-3">
          <p className="text-4xl">🔌</p>
          <p className="font-semibold text-slate-800">Impossible de charger tes données</p>
          <p className="text-sm text-slate-500">Le serveur ne répond pas pour le moment. Tes données ne sont pas perdues.</p>
          <p className="text-xs text-slate-400">{loadError}</p>
          <button className="btn-primary w-full" onClick={reload}>Réessayer</button>
          <button className="btn-secondary w-full" onClick={logout}>Se déconnecter</button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        <p>Chargement…</p>
      </div>
    );
  }

  // Migration d'abord si ancienne data détectée
  if (migrating) {
    return (
      <MigrationScreen onDone={async () => {
        const fresh = await fetchAll();
        dispatch({ type: 'LOAD_STATE', payload: fresh });
        setMigrating(false);
      }} />
    );
  }

  if (!profile.onboardingDone) {
    return <Onboarding />;
  }

  const Page = PAGES[page] || Dashboard;

  return (
    <Layout page={page} onNavigate={setPage}>
      <Page key={page} params={params} navigate={setPage} />
    </Layout>
  );
}

function App() {
  const { isAuthenticated } = useAuth();
  const [authMode, setAuthMode] = useState('login');

  if (!isAuthenticated) {
    return authMode === 'login'
      ? <Login onSwitch={() => setAuthMode('register')} />
      : <Register onSwitch={() => setAuthMode('login')} />;
  }

  return (
    <BudgetProvider>
      <BudgetApp />
    </BudgetProvider>
  );
}

export default App;
