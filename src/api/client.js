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
    const err = await res.json().catch(() => ({ error: 'Erreur réseau' }));
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
  delete: (path) => request('DELETE', path),
};

export async function fetchAll() {
  const [profile, settings, fixedCharges, envelopes, transactions, savingsHistory] = await Promise.all([
    api.get('/api/profile'),
    api.get('/api/settings'),
    api.get('/api/charges'),
    api.get('/api/envelopes'),
    api.get('/api/transactions'),
    api.get('/api/savings'),
  ]);
  return {
    profile: {
      firstName: profile.firstName || '',
      netSalary: Number(profile.netSalary) || 0,
      hasCar: profile.hasCar ?? true,
      isSmoker: profile.isSmoker ?? false,
      householdAdults: profile.householdAdults ?? 1,
      householdChildren: profile.householdChildren ?? 0,
      pets: profile.pets || { dogs: 0, cats: 0, other: 0 },
      region: profile.region || 'Île-de-France',
      supermarket: profile.supermarket || 'leclerc',
      registrationDate: profile.registrationDate || null,
      onboardingDone: profile.onboardingDone || false,
    },
    settings: { viewMode: settings.view_mode || settings.viewMode || 'monthly' },
    fixedCharges,
    envelopes,
    transactions,
    savingsHistory,
  };
}
