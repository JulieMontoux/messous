import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ChargeForm from '../components/ChargeForm';
import TobaccoFields from '../components/TobaccoFields';
import TrendsCard from '../components/TrendsCard';
import { installFakeApi } from '../test/fakeApi';
import { freezeDate, field } from '../test/render';
import { fixtures } from '../test/fixtures';
import { useState } from 'react';

function renderApp(api, { token = 'jeton', url = '/' } = {}) {
  freezeDate();
  const fake = installFakeApi(api);
  if (token) localStorage.setItem('messous_token', token);
  window.history.replaceState(null, '', url);
  const user = userEvent.setup();
  render(<AuthProvider><App /></AuthProvider>);
  return { fake, user };
}

describe('écrans de connexion', () => {
  it('connexion : erreur affichée puis succès', async () => {
    installFakeApi();
    const user = userEvent.setup();
    render(<AuthProvider><Login onSwitch={vi.fn()} /></AuthProvider>);
    await user.type(screen.getByPlaceholderText('julie@exemple.fr'), 'a@b.fr');
    await user.type(screen.getByPlaceholderText('••••••••'), 'faux');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(await screen.findByText('Email ou mot de passe incorrect')).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText('••••••••'));
    await user.type(screen.getByPlaceholderText('••••••••'), 'motdepasse1');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    await waitFor(() => expect(localStorage.getItem('messous_token')).toBe('jeton'));
  });

  it('inscription : mots de passe différents, erreur serveur, succès', async () => {
    installFakeApi({ registerError: 'Email déjà utilisé' });
    const user = userEvent.setup();
    const onSwitch = vi.fn();
    render(<AuthProvider><Register onSwitch={onSwitch} /></AuthProvider>);
    await user.type(screen.getByPlaceholderText('julie@exemple.fr'), 'a@b.fr');
    await user.type(screen.getByPlaceholderText('Min. 6 caractères'), 'motdepasse1');
    await user.type(screen.getByPlaceholderText('••••••••'), 'autre');
    await user.click(screen.getByRole('button', { name: /Créer mon compte/ }));
    expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText('••••••••'));
    await user.type(screen.getByPlaceholderText('••••••••'), 'motdepasse1');
    await user.click(screen.getByRole('button', { name: /Créer mon compte/ }));
    expect(await screen.findByText('Email déjà utilisé')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(onSwitch).toHaveBeenCalled();
  });
});

describe('application', () => {
  it('non connecté : connexion ↔ inscription', async () => {
    const { user } = renderApp({}, { token: null });
    await user.click(await screen.findByRole('button', { name: "S'inscrire" }));
    expect(screen.getByText('Créer un compte')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));
    expect(screen.getByText('Connexion à ton compte')).toBeInTheDocument();
  });

  it('connecté : tableau de bord, navigation latérale et mobile, URL mise à jour, photo du mois enregistrée', async () => {
    const { user, fake } = renderApp({}, { url: '/?page=inconnue' });
    expect(await screen.findAllByText('Julie')).not.toHaveLength(0);
    await waitFor(() => expect(fake.called('PUT', /\/api\/savings\/2026-11$/).length).toBeGreaterThan(0));
    const sidebar = screen.getAllByRole('navigation')[0];
    await user.click(within(sidebar).getByRole('button', { name: /Charges fixes/ }));
    expect(await screen.findByRole('heading', { name: 'Charges fixes' })).toBeInTheDocument();
    expect(window.location.search).toBe('?page=charges');
    // Barre repliable
    await user.click(document.querySelector('aside > button.absolute'));
    await user.click(document.querySelector('aside > button.absolute'));
    // Navigation mobile + menu « Plus »
    const bottom = screen.getAllByRole('navigation').at(-1);
    await user.click(within(bottom).getByRole('button', { name: 'Plus' }));
    await user.click(screen.getAllByRole('button', { name: 'Avances' }).at(-1));
    expect(await screen.findByRole('heading', { name: 'Avances' })).toBeInTheDocument();
    await user.click(within(bottom).getByRole('button', { name: 'Plus' }));
    await user.click(document.querySelector('.fixed.inset-0.z-40'));
    await user.click(within(bottom).getByRole('button', { name: 'Banque' }));
    expect(await screen.findByRole('heading', { name: 'Banque' })).toBeInTheDocument();
    // Profil depuis le prénom, puis déconnexion
    await user.click(screen.getByText('Modifier mon profil'));
    expect(await screen.findByRole('heading', { name: 'Profil' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Déconnexion' })[0]);
    expect(await screen.findByText('Connexion à ton compte')).toBeInTheDocument();
  });

  it('erreur d\'enregistrement : bandeau ; nouvelle version : bandeau de rechargement', async () => {
    vi.stubEnv('DEV', false);
    renderApp({ serverVersion: 'v-suivante' });
    await screen.findAllByText('Julie');
    window.dispatchEvent(new CustomEvent('messous:sync-error', { detail: 'disque plein' }));
    expect(await screen.findByText(/Erreur sauvegarde : disque plein/)).toBeInTheDocument();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    await userEvent.click(await screen.findByRole('button', { name: /Recharger/ }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('démarrage non fait → écran de démarrage ; API en panne → écran d\'erreur avec réessai et déconnexion', async () => {
    const { user, fake } = renderApp({ profile: { onboardingDone: false } });
    expect(await screen.findByText(/Bienvenue/)).toBeInTheDocument();
    void user; void fake;
    const second = renderApp({ down: true });
    expect(await screen.findAllByText('Impossible de charger tes données')).not.toHaveLength(0);
    second.fake.db.down = false;
    await second.user.click(screen.getAllByRole('button', { name: 'Réessayer' })[0]);
    expect(await screen.findAllByText('Julie')).not.toHaveLength(0);
  });

  it('API en panne : déconnexion depuis l\'écran d\'erreur', async () => {
    const { user } = renderApp({ down: true });
    await user.click(await screen.findByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByText('Connexion à ton compte')).toBeInTheDocument();
  });

  it('anciennes données locales : import ou abandon', async () => {
    localStorage.setItem('messous_v1', JSON.stringify({
      profile: { firstName: 'Ancien', netSalary: 2000, onboardingDone: true },
      settings: { viewMode: 'weekly' },
      fixedCharges: [{ id: 'f', name: 'Loyer', amount: 500 }],
      envelopes: [{ id: 'e', name: 'Courses', budgetMonthly: 200 }],
      transactions: [{ id: 't', envelopeId: 'e', amount: 5, date: '2026-11-01' }],
      savingsHistory: [{ month: '2026-10', salary: 2000 }],
    }));
    const { user, fake } = renderApp();
    expect(await screen.findByText('Données trouvées')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Importer 3 éléments/ }));
    await waitFor(() => expect(localStorage.getItem('messous_v1')).toBeNull());
    expect(fake.called('POST', /\/api\/charges$/)).toHaveLength(1);
    expect(fake.called('PUT', /\/api\/savings\/2026-10$/)).toHaveLength(1);
  });

  it('anciennes données : erreur d\'import puis abandon', async () => {
    localStorage.setItem('messous_v1', JSON.stringify({ profile: { onboardingDone: true } }));
    const { user, fake } = renderApp();
    await screen.findByText('Données trouvées');
    fake.db.down = true;
    await user.click(screen.getByRole('button', { name: /Importer/ }));
    expect(await screen.findByText(/Serveur injoignable/)).toBeInTheDocument();
    fake.db.down = false;
    await user.click(screen.getByRole('button', { name: 'Ignorer et repartir à zéro' }));
    expect(await screen.findAllByText('Julie')).not.toHaveLength(0);
  });

  it('anciennes données invalides ou incomplètes : ignorées', async () => {
    localStorage.setItem('messous_v1', '{pas du json');
    renderApp();
    expect(await screen.findAllByText('Julie')).not.toHaveLength(0);
  });
});

function FormHarness({ initial }) {
  const [form, setForm] = useState(initial);
  return <><ChargeForm form={form} setForm={setForm} /><pre data-testid="state">{JSON.stringify(form)}</pre></>;
}

describe('formulaires partagés', () => {
  it('charge fixe : fréquences, mois, fin prévue', async () => {
    const user = userEvent.setup();
    render(<FormHarness initial={{ name: '', categoryId: 'housing', amount: '', frequency: 'monthly', dueMonth: 3, endMonth: '' }} />);
    const state = () => JSON.parse(screen.getByTestId('state').textContent);
    await user.type(field('Nom'), 'Netflix');
    await user.selectOptions(field('Catégorie'), 'subscription');
    await user.click(screen.getByRole('button', { name: 'Annuel' }));
    await user.type(field(/Montant par an/), '120');
    expect(screen.getByText(/1\/12 mis de côté/)).toBeInTheDocument();
    await user.selectOptions(field('Prélevé en'), '10');
    await user.click(screen.getByRole('button', { name: 'Trimestriel' }));
    expect(screen.getByText(/1\/3 mis de côté/)).toBeInTheDocument();
    expect(field('1re échéance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Hebdo' }));
    expect(screen.getByText(/× 4,33|\/ mois dans le budget/)).toBeInTheDocument();
    await user.type(field(/Se termine en/), '2027-03');
    await user.click(screen.getByRole('button', { name: 'Sans fin' }));
    expect(state()).toMatchObject({ name: 'Netflix', categoryId: 'subscription', frequency: 'weekly', dueMonth: 10, endMonth: '' });
  });

  it('tabac : changer de type remet les valeurs par défaut, saisie libre', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TobaccoFields value={{ tobaccoType: 'indus', tobaccoPackPrice: 13, tobaccoPacksPerWeek: 7 }} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: /Roulé/ }));
    expect(onChange).toHaveBeenCalledWith({ tobaccoType: 'roule', tobaccoPackPrice: 17.5, tobaccoPacksPerWeek: 2 });
    await user.clear(screen.getAllByRole('spinbutton')[0]);
    expect(onChange).toHaveBeenLastCalledWith({ tobaccoPackPrice: '' });
    await user.type(screen.getAllByRole('spinbutton')[1], '1');
    expect(onChange).toHaveBeenLastCalledWith({ tobaccoPacksPerWeek: 71 });
    await user.clear(screen.getAllByRole('spinbutton')[1]);
    expect(onChange).toHaveBeenLastCalledWith({ tobaccoPacksPerWeek: '' });
    expect(screen.getByText(/Budget tabac estimé/)).toBeInTheDocument();
  });

  it('tendances : graphique, choix d\'une enveloppe, variations ; rien sans dépenses', async () => {
    freezeDate();
    const { transactions, envelopes } = fixtures();
    const user = userEvent.setup();
    render(<TrendsCard transactions={transactions} envelopes={envelopes} />);
    expect(screen.getByText('Tendances sur 12 mois')).toBeInTheDocument();
    expect(screen.getByText(/Moyenne des mois terminés/)).toBeInTheDocument();
    expect(screen.getAllByText(/Restos/).length).toBeGreaterThan(1);
    expect(screen.getByText('nouveau')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), 'env-courses');
    expect(screen.getByText("+27 %")).toBeInTheDocument();
    const { container } = render(<TrendsCard transactions={[]} envelopes={envelopes} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('infobulle des tendances', () => {
  it('rien hors survol ; mois terminé ; mois en cours', async () => {
    const { TrendTooltip } = await import('../components/TrendsCard');
    const { container } = render(<TrendTooltip active={false} payload={[]} />);
    expect(container).toBeEmptyDOMElement();
    render(<TrendTooltip active payload={[{ payload: { month: '2026-10', total: 280 } }]} />);
    expect(screen.getByText('oct. 26')).toBeInTheDocument();
    render(<TrendTooltip active payload={[{ payload: { month: '2026-11', total: 20, current: true } }]} />);
    expect(screen.getByText('nov. 26 · en cours')).toBeInTheDocument();
  });

  it('baisse des dépenses et enveloppe sans dépense passée', async () => {
    freezeDate();
    const envelopes = [{ id: 'a', type: 'need', name: 'A' }, { id: 's', type: 'saving', name: 'S' }];
    const tx = [
      { envelopeId: 'a', amount: 300, date: '2026-07-05' }, { envelopeId: 'a', amount: 300, date: '2026-08-05' },
      { envelopeId: 'a', amount: 300, date: '2026-09-05' }, { envelopeId: 'a', amount: 100, date: '2026-10-05' },
    ];
    render(<TrendsCard transactions={tx} envelopes={envelopes} />);
    expect(screen.getByText('-67 %')).toBeInTheDocument();
  });
});
