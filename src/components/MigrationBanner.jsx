import { useState } from 'react';
import { api } from '../api/client';
import { useBudget } from '../context/BudgetContext';

const LEGACY_KEY = 'messous_v1';

function parseLegacy() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.profile?.onboardingDone) return null;
    return data;
  } catch {
    return null;
  }
}

export function useLegacyData() {
  const [legacy] = useState(() => parseLegacy());
  return legacy;
}

export default function MigrationBanner() {
  const legacy = useLegacyData();
  const { dispatch } = useBudget();
  const [status, setStatus] = useState('idle'); // idle | importing | done | error
  const [error, setError] = useState('');

  if (!legacy || status === 'done') return null;

  async function importData() {
    setStatus('importing');
    setError('');
    try {
      const { profile, fixedCharges = [], envelopes = [], transactions = [], savingsHistory = [], settings } = legacy;

      // Profile
      await api.put('/api/profile', {
        firstName: profile.firstName,
        netSalary: profile.netSalary,
        hasCar: profile.hasCar,
        isSmoker: profile.isSmoker,
        householdAdults: profile.householdAdults,
        householdChildren: profile.householdChildren,
        pets: profile.pets,
        region: profile.region,
        supermarket: profile.supermarket,
        registrationDate: profile.registrationDate,
        onboardingDone: true,
      });

      // Settings
      if (settings?.viewMode) {
        await api.put('/api/settings', { viewMode: settings.viewMode });
      }

      // Fixed charges
      for (const c of fixedCharges) {
        await api.post('/api/charges', { id: c.id, name: c.name, amount: c.amount, categoryId: c.categoryId, icon: c.icon });
      }

      // Envelopes
      for (const e of envelopes) {
        await api.post('/api/envelopes', { id: e.id, name: e.name, categoryId: e.categoryId, icon: e.icon, colorKey: e.colorKey, type: e.type, budgetMonthly: e.budgetMonthly });
      }

      // Transactions
      for (const t of transactions) {
        await api.post('/api/transactions', { id: t.id, envelopeId: t.envelopeId, amount: t.amount, note: t.note, date: t.date });
      }

      // Savings history
      for (const s of savingsHistory) {
        await api.put(`/api/savings/${s.month}`, s);
      }

      // Reload state from API
      const { fetchAll } = await import('../api/client');
      const freshData = await fetchAll();
      dispatch({ type: 'LOAD_STATE', payload: freshData });

      // Supprimer l'ancienne clé
      localStorage.removeItem(LEGACY_KEY);
      setStatus('done');
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  const count = (legacy.fixedCharges?.length || 0) + (legacy.envelopes?.length || 0) + (legacy.transactions?.length || 0);

  return (
    <div className="mx-4 mt-4 lg:mx-0 lg:mt-0 mb-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">📦</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-800">Données trouvées dans l'ancienne version</p>
          <p className="text-xs text-amber-600 mt-0.5">
            {count} éléments détectés ({legacy.fixedCharges?.length || 0} charges, {legacy.envelopes?.length || 0} enveloppes, {legacy.transactions?.length || 0} dépenses)
          </p>
          {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
        </div>
        <button
          onClick={importData}
          disabled={status === 'importing'}
          className="flex-shrink-0 bg-amber-500 text-white text-xs font-semibold px-3 py-2 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {status === 'importing' ? 'Import…' : 'Importer'}
        </button>
      </div>
    </div>
  );
}
