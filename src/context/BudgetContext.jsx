import { createContext, useContext, useReducer, useEffect, useState, useCallback } from 'react';
import { api, fetchAll, DEFAULT_PROFILE } from '../api/client';

const defaultState = {
  profile: { ...DEFAULT_PROFILE },
  fixedCharges: [],
  envelopes: [],
  transactions: [],
  savingsHistory: [],
  withdrawals: [],
  bankTransactions: [],
  settings: { viewMode: 'monthly' },
};

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD_STATE':
      return { ...defaultState, ...action.payload };

    case 'UPDATE_PROFILE':
      return { ...state, profile: { ...state.profile, ...action.payload } };

    case 'COMPLETE_ONBOARDING':
      return {
        ...state,
        profile: { ...state.profile, ...action.payload.profile, onboardingDone: true, registrationDate: new Date().toISOString() },
        fixedCharges: action.payload.fixedCharges,
        envelopes: action.payload.envelopes,
      };

    case 'UPSERT_MONTH_SNAPSHOT':
    case 'CLOSE_MONTH': {
      const snap = action.payload;
      const prev = state.savingsHistory.find(s => s.month === snap.month);
      const existing = state.savingsHistory.filter(s => s.month !== snap.month);
      const merged = action.type === 'CLOSE_MONTH'
        ? { ...prev, ...snap, month: snap.month, closedAt: new Date().toISOString() }
        : { ...prev, ...snap };
      return { ...state, savingsHistory: [...existing, merged].sort((a, b) => a.month.localeCompare(b.month)) };
    }

    case 'ADD_WITHDRAWAL':
      return { ...state, withdrawals: [action.payload, ...state.withdrawals].sort((a, b) => b.date.localeCompare(a.date)) };

    case 'DELETE_WITHDRAWAL':
      return { ...state, withdrawals: state.withdrawals.filter(w => w.id !== action.payload) };

    // Actions locales (la synchronisation est faite par l'appelant)
    case 'SET_BANK_TRANSACTIONS':
      return { ...state, bankTransactions: action.payload };

    case 'SET_TRANSACTIONS':
      return { ...state, transactions: action.payload };

    case 'ADD_FIXED_CHARGE':
      return { ...state, fixedCharges: [...state.fixedCharges, action.payload] };

    case 'UPDATE_FIXED_CHARGE':
      return { ...state, fixedCharges: state.fixedCharges.map(c => c.id === action.payload.id ? action.payload : c) };

    case 'DELETE_FIXED_CHARGE':
      return { ...state, fixedCharges: state.fixedCharges.filter(c => c.id !== action.payload) };

    case 'ADD_ENVELOPE':
      return { ...state, envelopes: [...state.envelopes, action.payload] };

    case 'UPDATE_ENVELOPE':
      return { ...state, envelopes: state.envelopes.map(e => e.id === action.payload.id ? action.payload : e) };

    case 'DELETE_ENVELOPE':
      return {
        ...state,
        envelopes: state.envelopes.filter(e => e.id !== action.payload),
        transactions: state.transactions.filter(t => t.envelopeId !== action.payload),
      };

    case 'ADD_TRANSACTION':
      return { ...state, transactions: [...state.transactions, action.payload] };

    case 'DELETE_TRANSACTION':
      return {
        ...state,
        transactions: state.transactions.filter(t => t.id !== action.payload),
        bankTransactions: state.bankTransactions.map(b => b.transactionId === action.payload
          ? { ...b, transactionId: null, envelopeId: null } : b),
      };

    case 'SET_VIEW_MODE':
      return { ...state, settings: { ...state.settings, viewMode: action.payload } };

    case 'RESET':
      return defaultState;

    default:
      return state;
  }
}

function toApiProfile(p) {
  const { accountEmail: _a, mailConfigured: _m, ...rest } = p;
  return rest;
}

async function syncToApi(action) {
  switch (action.type) {
    case 'UPDATE_PROFILE':
      return api.put('/api/profile', toApiProfile(action.payload));

    case 'COMPLETE_ONBOARDING': {
      const { profile, fixedCharges, envelopes } = action.payload;
      const regDate = new Date().toISOString();
      await api.put('/api/profile', { ...toApiProfile(profile), onboardingDone: true, registrationDate: regDate });
      await Promise.all(fixedCharges.map(c => api.post('/api/charges', c)));
      await Promise.all(envelopes.map(e => api.post('/api/envelopes', e)));
      break;
    }

    case 'ADD_FIXED_CHARGE':
      return api.post('/api/charges', action.payload);

    case 'UPDATE_FIXED_CHARGE':
      return api.put(`/api/charges/${action.payload.id}`, action.payload);

    case 'DELETE_FIXED_CHARGE':
      return api.delete(`/api/charges/${action.payload}`);

    case 'ADD_ENVELOPE':
      return api.post('/api/envelopes', action.payload);

    case 'UPDATE_ENVELOPE':
      return api.put(`/api/envelopes/${action.payload.id}`, action.payload);

    case 'DELETE_ENVELOPE':
      return api.delete(`/api/envelopes/${action.payload}`);

    case 'ADD_TRANSACTION':
      return api.post('/api/transactions', action.payload);

    case 'DELETE_TRANSACTION':
      return api.delete(`/api/transactions/${action.payload}`);

    case 'UPSERT_MONTH_SNAPSHOT':
      return api.put(`/api/savings/${action.payload.month}`, action.payload);

    case 'CLOSE_MONTH':
      return api.put(`/api/savings/${action.payload.month}/close`, action.payload);

    case 'ADD_WITHDRAWAL':
      return api.post('/api/withdrawals', action.payload);

    case 'DELETE_WITHDRAWAL':
      return api.delete(`/api/withdrawals/${action.payload}`);

    case 'SET_VIEW_MODE':
      return api.put('/api/settings', { viewMode: action.payload });

    default:
      break;
  }
}

const BudgetContext = createContext(null);

export function BudgetProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, defaultState);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Si le chargement échoue, on ne bascule PAS sur l'état par défaut :
  // il afficherait l'onboarding et pourrait écraser le profil existant.
  const load = useCallback(() => {
    setLoadError('');
    setReady(false);
    fetchAll()
      .then(data => {
        dispatch({ type: 'LOAD_STATE', payload: data });
        setReady(true);
      })
      .catch(err => setLoadError(err.message || 'Serveur injoignable'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const apiDispatch = useCallback((action) => {
    dispatch(action);
    syncToApi(action).catch(err => {
      console.error('[API sync]', action.type, err.message);
      // Affiche un bandeau d'erreur visible si la sauvegarde échoue
      window.dispatchEvent(new CustomEvent('messous:sync-error', { detail: err.message }));
    });
  }, []);

  return (
    <BudgetContext.Provider value={{ state, dispatch: apiDispatch, ready, loadError, reload: load }}>
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider');
  return ctx;
}
