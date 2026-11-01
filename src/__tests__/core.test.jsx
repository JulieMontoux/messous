import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, renderHook, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { api, fetchAll, fetchBankTransactions, retryDelay } from '../api/client';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { BudgetProvider, useBudget } from '../context/BudgetContext';
import { useTheme } from '../hooks/useTheme';
import { useVersionCheck } from '../hooks/useVersionCheck';
import { fetchFuelPrices } from '../utils/fuelApi';
import { pushSupported, currentSubscription, enablePush, disablePush } from '../utils/push';
import { cn } from '../lib/utils';
import { getSupermarket, adjustGroceryBudget } from '../data/supermarkets';
import { getTobaccoType, defaultFixedCharges, suggestEnvelopes, generateId, blankCharge } from '../data/defaults';
import Modal from '../components/Modal';
import PageHeader from '../components/PageHeader';
import { installFakeApi } from '../test/fakeApi';
import { freezeDate } from '../test/render';

describe('client API', () => {
  it('ajoute le jeton, renvoie le JSON', async () => {
    const fake = installFakeApi();
    localStorage.setItem('messous_token', 'abc');
    const p = await api.get('/api/profile');
    expect(p.firstName).toBe('Julie');
    expect(fake.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer abc');
  });

  it('401 : jeton effacé et événement de déconnexion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Token invalide' }) })));
    localStorage.setItem('messous_token', 'abc');
    const onLogout = vi.fn();
    window.addEventListener('messous:logout', onLogout);
    await expect(api.post('/api/x', {})).rejects.toThrow('Token invalide');
    expect(localStorage.getItem('messous_token')).toBeNull();
    expect(onLogout).toHaveBeenCalled();
    window.removeEventListener('messous:logout', onLogout);
  });

  it('réponse non JSON : message selon le code HTTP', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })));
    await expect(api.get('/api/x')).rejects.toThrow('Serveur injoignable (502)');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => { throw new Error('html'); } })));
    await expect(api.put('/api/x', {})).rejects.toThrow('Erreur serveur (500)');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, json: async () => ({}) })));
    await expect(api.delete('/api/x')).rejects.toThrow('Erreur serveur');
  });

  it('429 / 503 passager : nouvel essai automatique ; blocage long : erreur directe', async () => {
    const res = (status, retryAfter) => ({
      ok: status < 400, status,
      headers: { get: name => (name === 'Retry-After' ? retryAfter : null) },
      json: async () => (status < 400 ? { ok: true } : { error: 'Trop de tentatives. Réessaie dans 15 min.' }),
    });
    // Proxy qui refuse deux fois puis accepte
    let n = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++n <= 2 ? { ...res(429, null), json: async () => { throw new Error('html'); } } : res(200))));
    await expect(api.post('/api/charges', {})).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(3);

    // Toujours refusé : 3 nouveaux essais puis message clair
    vi.stubGlobal('fetch', vi.fn(async () => ({ ...res(429, '0'), json: async () => { throw new Error('html'); } })));
    await expect(api.get('/api/x')).rejects.toThrow('Trop de requêtes envoyées au serveur (429)');
    expect(fetch).toHaveBeenCalledTimes(4);

    // Blocage de connexion (Retry-After en minutes) : pas de nouvel essai
    vi.stubGlobal('fetch', vi.fn(async () => res(429, '900')));
    await expect(api.post('/api/auth/login', {})).rejects.toThrow('Trop de tentatives');
    expect(fetch).toHaveBeenCalledTimes(1);

    expect(retryDelay(res(503, '2'), 0)).toBe(2000);
    expect(retryDelay(res(503, 'abc'), 1)).toBe(800);
    expect(retryDelay(res(500, null), 0)).toBeNull();
    expect(retryDelay({ status: 429 }, 0)).toBe(400);
  }, 15000);

  it('téléchargement d\'un export', async () => {
    installFakeApi();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await api.download('/api/export/depenses.csv', 'x.csv');
    expect(click).toHaveBeenCalled();
    installFakeApi({ exportError: true });
    await expect(api.download('/api/export/depenses.csv', 'x.csv')).rejects.toThrow('Export impossible (500)');
  });

  it('chargement complet : valeurs par défaut du profil, listes en échec tolérées', async () => {
    const fake = installFakeApi({ settings: { viewMode: 'weekly' } });
    fake.db.profile = { firstName: 'A', netSalary: '1200', theme: null };
    const data = await fetchAll();
    expect(data.profile.netSalary).toBe(1200);
    expect(data.profile.theme).toBe('auto');
    expect(data.settings.viewMode).toBe('weekly');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    expect(await fetchBankTransactions()).toEqual([]);
  });
});

describe('authentification', () => {
  it('connexion, inscription, déconnexion (bouton et événement)', async () => {
    installFakeApi();
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.isAuthenticated).toBe(false);
    await act(() => result.current.login('a@b.fr', 'motdepasse1'));
    expect(result.current.isAuthenticated).toBe(true);
    act(() => result.current.logout());
    expect(result.current.isAuthenticated).toBe(false);
    await act(() => result.current.register('a@b.fr', 'motdepasse1'));
    expect(localStorage.getItem('messous_token')).toBe('jeton');
    act(() => { window.dispatchEvent(new Event('messous:logout')); });
    expect(result.current.isAuthenticated).toBe(false);
  });
});

describe('état du budget', () => {
  const wrapper = ({ children }) => <BudgetProvider>{children}</BudgetProvider>;

  it('useBudget hors fournisseur : erreur claire', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useBudget())).toThrow('useBudget must be used within BudgetProvider');
  });

  it('chaque action met à jour l\'état et appelle la bonne route', async () => {
    freezeDate();
    const fake = installFakeApi();
    const { result } = renderHook(() => useBudget(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const d = a => act(() => result.current.dispatch(a));
    const env = { id: 'e-new', name: 'N', budgetMonthly: 10, type: 'need' };
    const charge = { id: 'c-new', name: 'C', amount: 5 };
    const actions = [
      [{ type: 'UPDATE_PROFILE', payload: { firstName: 'Zoé', accountEmail: 'x', mailConfigured: true } }, 'PUT', /\/api\/profile$/],
      [{ type: 'ADD_FIXED_CHARGE', payload: charge }, 'POST', /\/api\/charges$/],
      [{ type: 'UPDATE_FIXED_CHARGE', payload: { ...charge, amount: 6 } }, 'PUT', /\/api\/charges\/c-new/],
      [{ type: 'DELETE_FIXED_CHARGE', payload: 'c-new' }, 'DELETE', /\/api\/charges\/c-new/],
      [{ type: 'ADD_ENVELOPE', payload: env }, 'POST', /\/api\/envelopes$/],
      [{ type: 'UPDATE_ENVELOPE', payload: { ...env, budgetMonthly: 20 } }, 'PUT', /\/api\/envelopes\/e-new/],
      [{ type: 'ADD_TRANSACTION', payload: { id: 'tx-new', envelopeId: 'e-new', amount: 3, date: '2026-11-15' } }, 'POST', /\/api\/transactions$/],
      [{ type: 'DELETE_TRANSACTION', payload: 't1' }, 'DELETE', /\/api\/transactions\/t1/],
      [{ type: 'DELETE_ENVELOPE', payload: 'e-new' }, 'DELETE', /\/api\/envelopes\/e-new/],
      [{ type: 'SET_VIEW_MODE', payload: 'weekly' }, 'PUT', /\/api\/settings/],
      [{ type: 'ADD_WITHDRAWAL', payload: { id: 'w-new', date: '2026-11-15', amount: 20 } }, 'POST', /\/api\/withdrawals$/],
      [{ type: 'DELETE_WITHDRAWAL', payload: 'w-new' }, 'DELETE', /\/api\/withdrawals\/w-new/],
      [{ type: 'UPSERT_MONTH_SNAPSHOT', payload: { month: '2026-11', salary: 2600 } }, 'PUT', /\/api\/savings\/2026-11$/],
      [{ type: 'CLOSE_MONTH', payload: { month: '2026-12', actualSavings: 1, carryovers: [{ envelopeId: 'env-courses', amount: 5 }, { envelopeId: 'x', amount: 0 }] } }, 'PUT', /\/api\/savings\/2026-12\/close/],
      [{ type: 'COMPLETE_ONBOARDING', payload: { profile: { firstName: 'Z' }, fixedCharges: [charge], envelopes: [env] } }, 'PUT', /\/api\/profile$/],
    ];
    for (const [action, method, re] of actions) {
      const before = fake.called(method, re).length;
      await d(action);
      await waitFor(() => expect(fake.called(method, re).length).toBeGreaterThan(before));
    }
    const s = result.current.state;
    expect(s.settings.viewMode).toBe('weekly');
    expect(s.transactions.find(t => t.id === 't1')).toBeUndefined();
    expect(s.carryovers).toEqual(expect.arrayContaining([{ envelopeId: 'env-courses', month: '2027-01', amount: 5 }]));
    expect(s.savingsHistory.find(x => x.month === '2026-12').closedAt).toBeTruthy();
    expect(s.profile.onboardingDone).toBe(true);
    // Actions locales (sans appel réseau)
    const n = fake.calls.length;
    await d({ type: 'SET_PROFILE', payload: { firstName: 'Local' } });
    await d({ type: 'SET_ADVANCES', payload: [] });
    await d({ type: 'SET_WITHDRAWALS', payload: [] });
    await d({ type: 'SET_FIXED_CHARGES', payload: [] });
    await d({ type: 'SET_BANK_TRANSACTIONS', payload: [] });
    await d({ type: 'SET_TRANSACTIONS', payload: [] });
    await d({ type: 'INCONNUE' });
    expect(fake.calls.length).toBe(n);
    expect(result.current.state.profile.firstName).toBe('Local');
    await d({ type: 'RESET' });
    expect(result.current.state.envelopes).toEqual([]);
  });

  it('démarrage : enregistré un par un, un refus n\'empêche pas le reste et est signalé', async () => {
    const fake = installFakeApi();
    const { result } = renderHook(() => useBudget(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    const normal = fake.fetch.getMockImplementation();
    let inFlight = 0;
    let maxInFlight = 0;
    let refused = false;
    fake.fetch.mockImplementation(async (url, opts = {}) => {
      if (opts.method === 'POST' && /\/api\/charges$/.test(url) && !refused) {
        refused = true;
        return { ok: false, status: 500, json: async () => ({ error: 'refusé' }) };
      }
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight -= 1;
      return normal(url, opts);
    });
    const onErr = vi.fn();
    window.addEventListener('messous:sync-error', onErr);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const charges = [{ id: 'c1', name: 'A', amount: 1 }, { id: 'c2', name: 'B', amount: 2 }];
    const envelopes = [{ id: 'e1', name: 'X' }, { id: 'e2', name: 'Y' }];
    const before = fake.fetch.mock.calls.length;
    await act(() => result.current.dispatch({ type: 'COMPLETE_ONBOARDING', payload: { profile: { firstName: 'Z' }, fixedCharges: charges, envelopes } }));
    await waitFor(() => expect(onErr).toHaveBeenCalled());
    window.removeEventListener('messous:sync-error', onErr);
    expect(onErr.mock.calls[0][0].detail).toMatch(/1 élément\(s\) du démarrage non enregistré/);
    const posts = fake.fetch.mock.calls.slice(before).filter(([, o]) => o?.method === 'POST').map(([u]) => u);
    expect(posts).toEqual(['/api/charges', '/api/charges', '/api/envelopes', '/api/envelopes']);
    expect(maxInFlight).toBe(1);
  });

  it('échec d\'enregistrement : bandeau d\'erreur ; échec de chargement : erreur puis rechargement', async () => {
    const fake = installFakeApi({ down: true });
    const { result } = renderHook(() => useBudget(), { wrapper });
    await waitFor(() => expect(result.current.loadError).toMatch(/Serveur injoignable/));
    fake.db.down = false;
    await act(() => result.current.reload());
    await waitFor(() => expect(result.current.ready).toBe(true));
    fake.db.down = true;
    const onErr = vi.fn();
    window.addEventListener('messous:sync-error', onErr);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(() => result.current.dispatch({ type: 'ADD_ENVELOPE', payload: { id: 'z', name: 'Z' } }));
    await waitFor(() => expect(onErr).toHaveBeenCalled());
    window.removeEventListener('messous:sync-error', onErr);
  });
});

describe('thème et version', () => {
  it('sombre, clair, auto (préférence système) et mémorisation', () => {
    const listeners = [];
    window.matchMedia = () => ({ matches: true, addEventListener: (_, f) => listeners.push(f), removeEventListener: vi.fn() });
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
    const { rerender, unmount } = renderHook(({ t }) => useTheme(t), { initialProps: { t: 'dark' } });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(meta.getAttribute('content')).toBe('#0b1120');
    rerender({ t: 'light' });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    rerender({ t: 'auto' });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('messous_theme')).toBe('auto');
    listeners.at(-1)();
    unmount();
    meta.remove();
  });

  it('nouvelle version : rechargement si l\'onglet est caché, bandeau sinon ; rien en développement', async () => {
    vi.stubEnv('DEV', false);
    const fake = installFakeApi({ serverVersion: 'v2' });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    renderHook(() => useVersionCheck());
    await waitFor(() => expect(reload).toHaveBeenCalled());
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    const { result } = renderHook(() => useVersionCheck());
    await waitFor(() => expect(result.current).toBe(true));
    document.dispatchEvent(new Event('visibilitychange'));
    fake.db.serverVersion = __APP_VERSION__;
    const same = renderHook(() => useVersionCheck());
    await new Promise(r => setTimeout(r, 20));
    expect(same.result.current).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('hors ligne'); }));
    renderHook(() => useVersionCheck());
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    renderHook(() => useVersionCheck());
    vi.stubEnv('DEV', true);
    const dev = renderHook(() => useVersionCheck());
    expect(dev.result.current).toBe(false);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

describe('prix des carburants', () => {
  beforeEach(() => localStorage.clear());
  it('en direct puis depuis le cache, null en cas d\'erreur', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ gazole: 1.8456, sp95: 1.9, e10: 1.85, sp98: 1.95, e85: 0.9, gpl: 1.01 }] }) })));
    const live = await fetchFuelPrices();
    expect(live.source).toBe('live');
    expect(live.prices.gazole).toBe(1.846);
    expect((await fetchFuelPrices()).source).toBe('cache');
    localStorage.setItem('messous_fuel_v2', 'pas du json');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    expect(await fetchFuelPrices()).toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) })));
    expect(await fetchFuelPrices()).toBeNull();
  });
});

describe('notifications push (navigateur)', () => {
  it('non disponibles sans service worker', async () => {
    expect(pushSupported()).toBe(false);
    expect(await currentSubscription()).toBeNull();
  });

  it('abonnement et désabonnement', async () => {
    const fake = installFakeApi();
    const sub = { endpoint: 'https://push/1', toJSON: () => ({ endpoint: 'https://push/1', keys: { p256dh: 'a', auth: 'b' } }), unsubscribe: vi.fn() };
    let current = null;
    const reg = { pushManager: { getSubscription: async () => current, subscribe: vi.fn(async () => { current = sub; return sub; }) } };
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistration: async () => null, register: async () => reg, ready: Promise.resolve(reg) } });
    vi.stubGlobal('PushManager', function PushManager() {});
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
    expect(pushSupported()).toBe(true);
    await enablePush();
    expect(reg.pushManager.subscribe.mock.calls[0][0].applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(fake.called('POST', /\/api\/push\/subscribe/)).toHaveLength(1);
    await disablePush();
    expect(sub.unsubscribe).toHaveBeenCalled();
    current = null;
    await disablePush();
    vi.stubGlobal('Notification', { requestPermission: async () => 'denied' });
    await expect(enablePush()).rejects.toThrow('Notifications refusées');
    vi.unstubAllGlobals();
  });
});

describe('données et utilitaires', () => {
  it('classes, supermarchés, tabac, charges par défaut, suggestions', () => {
    expect(cn('p-2', false, 'p-4')).toBe('p-4');
    expect(getSupermarket('inconnu').id).toBe('autre');
    expect(adjustGroceryBudget(300, 'lidl')).toBeLessThan(300);
    expect(getTobaccoType('inconnu').id).toBe('indus');
    expect(defaultFixedCharges()).toHaveLength(8);
    expect(generateId()).toMatch(/^[0-9a-f-]{36}$/);
    expect(blankCharge().frequency).toBe('monthly');
    const s = suggestEnvelopes({ netSalary: 3000, householdAdults: 2, householdChildren: 2, pets: { dogs: 1, cats: 1, other: 1 }, hasCar: true, isSmoker: false });
    expect(s.pets).toBeGreaterThan(0);
    expect(s.fuel).toBeGreaterThan(0);
    expect(s.car_maintenance).toBeGreaterThan(0);
    expect(suggestEnvelopes({ netSalary: 0, householdAdults: 0, pets: null }).pleasure).toBe(30);
  });
});

describe('composants simples', () => {
  it('fenêtre : fermeture par Échap, par le fond et par la croix', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { container } = render(<Modal title="Titre" onClose={onClose} footer={<button>OK</button>}><p>Contenu</p></Modal>);
    expect(screen.getByText('Contenu')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(container.querySelector('.backdrop-blur-sm'));
    await user.click(screen.getAllByRole('button')[0]);
    expect(onClose).toHaveBeenCalledTimes(3);
    render(<Modal title="Sans pied" onClose={onClose}><p>x</p></Modal>);
  });

  it('en-tête de page avec et sans actions', () => {
    render(<PageHeader title="T" subtitle="S"><button>A</button></PageHeader>);
    render(<PageHeader title="Seul" />);
    expect(screen.getByText('S')).toBeInTheDocument();
    expect(screen.getByText('Seul')).toBeInTheDocument();
  });
});
