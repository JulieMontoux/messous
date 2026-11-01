function getToken() {
  return localStorage.getItem('messous_token');
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAX_RETRIES = 3;

// 429 (trop de requêtes) ou 503 passager, par exemple renvoyé par un proxy placé devant l'app :
// on réessaie après une courte attente. Une attente longue (ex. blocage après des mots de passe
// erronés, Retry-After en minutes) n'est pas réessayée : l'erreur est affichée.
export function retryDelay(res, attempt) {
  if (![429, 503].includes(res.status) || attempt >= MAX_RETRIES) return null;
  const header = res.headers?.get?.('Retry-After');
  const seconds = header == null ? NaN : Number(header);
  const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 400 * 2 ** attempt;
  return delay <= 5000 ? delay : null;
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const delay = retryDelay(res, attempt);
    if (delay == null) break;
    await sleep(delay);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({
      error: res.status >= 502 && res.status <= 504
        ? `Serveur injoignable (${res.status}) — l'API ne répond pas`
        : res.status === 429
          ? 'Trop de requêtes envoyées au serveur (429) — réessaie dans un instant'
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

// Téléchargement d'un fichier protégé (export CSV) : requête authentifiée puis enregistrement local
async function download(path, filename) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`Export impossible (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const api = {
  download,
  post: (path, body) => request('POST', path, body),
  get: (path) => request('GET', path),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path, body) => request('DELETE', path, body),
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
  roundWithdrawals: true,
  idealNeedsPct: 50,
  idealWantsPct: 30,
  idealSavingsPct: 20,
  nextSalary: null,
  nextSalaryFrom: null,
  manualBalance: null,
  manualBalanceAt: null,
  monthlyReportEmail: true,
  theme: 'auto',
  tobaccoQuitDate: null,
  accountEmail: '',
  mailConfigured: false,
};

// Opérations bancaires depuis le 1er du mois dernier (période par défaut côté API)
export async function fetchBankTransactions() {
  return api.get('/api/bank/transactions').catch(() => []);
}

export async function fetchAll() {
  const [profile, settings, fixedCharges, envelopes, transactions, savingsHistory, withdrawals, bankTransactions, carryovers, advances] = await Promise.all([
    api.get('/api/profile'),
    api.get('/api/settings'),
    api.get('/api/charges'),
    api.get('/api/envelopes'),
    api.get('/api/transactions'),
    api.get('/api/savings'),
    api.get('/api/withdrawals').catch(() => []),
    fetchBankTransactions(),
    api.get('/api/envelopes/carryovers').catch(() => []),
    api.get('/api/advances').catch(() => []),
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
    carryovers,
    advances,
  };
}
