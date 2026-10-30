function getToken() {
  return localStorage.getItem('messous_token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({
      error: res.status >= 502 && res.status <= 504
        ? `Serveur injoignable (${res.status}) — l'API ne répond pas`
        : `Erreur serveur (${res.status})`,
    }));
    if (res.status === 401) {
      localStorage.removeItem('messous_token');
      // Déclenche un événement pour que AuthContext réagisse sans boucle de reload
      window.dispatchEvent(new Event('messous:logout'));
    }
    throw new Error(err.error || 'Erreur serveur');
  }
  return res.json();
}

export const api = {
  post: (path, body) => request('POST', path, body),
  get: (path) => request('GET', path),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
};

export const DEFAULT_PROFILE = {
  firstName: '',
  netSalary: 0,
  hasCar: true,
  isSmoker: false,
  householdAdults: 1,
  householdChildren: 0,
  pets: { dogs: 0, cats: 0, other: 0 },
  region: 'Île-de-France',
  supermarket: 'leclerc',
  registrationDate: null,
  onboardingDone: false,
  tobaccoType: 'indus',
  tobaccoPackPrice: 13,
  tobaccoPacksPerWeek: 7,
  alertsEnabled: true,
  alertThreshold: 80,
  alertEmail: '',
  monthEndEmail: true,
  accountEmail: '',
  mailConfigured: false,
};

export async function fetchBankTransactions() {
  const from = new Date();
  from.setDate(from.getDate() - 62);
  return api.get(`/api/bank/transactions?from=${from.toISOString().slice(0, 10)}`).catch(() => []);
}

export async function fetchAll() {
  const [profile, settings, fixedCharges, envelopes, transactions, savingsHistory, withdrawals, bankTransactions] = await Promise.all([
    api.get('/api/profile'),
    api.get('/api/settings'),
    api.get('/api/charges'),
    api.get('/api/envelopes'),
    api.get('/api/transactions'),
    api.get('/api/savings'),
    api.get('/api/withdrawals').catch(() => []),
    fetchBankTransactions(),
  ]);
  return {
    profile: {
      ...DEFAULT_PROFILE,
      ...Object.fromEntries(Object.entries(profile).filter(([, v]) => v !== null && v !== undefined)),
      netSalary: Number(profile.netSalary) || 0,
    },
    settings: { viewMode: settings.view_mode || settings.viewMode || 'monthly' },
    fixedCharges,
    envelopes,
    transactions,
    savingsHistory,
    withdrawals,
    bankTransactions,
  };
}
