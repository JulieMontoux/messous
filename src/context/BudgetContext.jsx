import { createContext, useContext, useReducer, useEffect, useState, useCallback } from 'react';
import { api, fetchAll } from '../api/client';

const defaultState = {
  profile: {
    firstName: '',
    netSalary: 0,
    hasCar: true,
    isSmoker: false,
    householdAdults: 1,
    householdChildren: 0,
    pets: { dogs: 0, cats: 0, other: 0 },
    region: 'Île-de-France',
    supermarket: 'leclerc',
    onboardingDone: false,
    registrationDate: null,
  },
  fixedCharges: [],
  envelopes: [],
  transactions: [],
  savingsHistory: [],
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
        profile: { ...action.payload.profile, onboardingDone: true, registrationDate: new Date().toISOString() },
        fixedCharges: action.payload.fixedCharges,
        envelopes: action.payload.envelopes,
      };

    case 'UPSERT_MONTH_SNAPSHOT': {
      const snap = action.payload;
      const existing = state.savingsHistory.filter(s => s.month !== snap.month);
      return { ...state, savingsHistory: [...existing, snap].sort((a, b) => a.month.localeCompare(b.month)) };
    }

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
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };

    case 'SET_VIEW_MODE':
      return { ...state, settings: { ...state.settings, viewMode: action.payload } };

    case 'RESET':
      return defaultState;

    default:
      return state;
  }
}

function toApiProfile(p) {
  return {
    firstName: p.firstName,
    netSalary: p.netSalary,
    hasCar: p.hasCar,
    isSmoker: p.isSmoker,
    householdAdults: p.householdAdults,
    householdChildren: p.householdChildren,
    pets: p.pets,
    region: p.region,
    supermarket: p.supermarket,
    registrationDate: p.registrationDate,
    onboardingDone: p.onboardingDone,
  };
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

  useEffect(() => {
    fetchAll()
      .then(data => {
        dispatch({ type: 'LOAD_STATE', payload: data });
        setReady(true);
      })
      .catch(() => setReady(true));
  }, []);

  const apiDispatch = useCallback((action) => {
    dispatch(action);
    syncToApi(action).catch(err => {
      console.error('[API sync]', action.type, err.message);
      // Affiche un bandeau d'erreur visible si la sauvegarde échoue
      window.dispatchEvent(new CustomEvent('messous:sync-error', { detail: err.message }));
    });
  }, []);

  return (
    <BudgetContext.Provider value={{ state, dispatch: apiDispatch, ready }}>
      {children}
    </BudgetContext.Provider>
  );
}

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used within BudgetProvider');
  return ctx;
}
