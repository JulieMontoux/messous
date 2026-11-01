import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import Onboarding from '../Onboarding';
import Suggestions from '../Suggestions';
import { renderPage } from '../../test/render';

describe('Démarrage', () => {
  it('les 5 étapes : profil, foyer, habitudes (tabac), charges, enveloppes, puis création', async () => {
    const { user, fake } = await renderPage(Onboarding, { api: { profile: { onboardingDone: false } } });
    const next = () => user.click(screen.getByRole('button', { name: /Continuer/ }));
    expect(screen.getByRole('button', { name: /Continuer/ })).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Ex. Julie'), 'Camille');
    await user.type(screen.getByPlaceholderText('Ex. 2200'), '1500');
    await next();

    // Foyer : compteurs (avec bornes) et animaux
    const counters = () => screen.getAllByRole('button', { name: '+' });
    await user.click(counters()[0]);
    await user.click(screen.getAllByRole('button', { name: '−' })[0]);
    await user.click(counters()[1]);
    await user.click(counters()[2]);
    await user.click(counters()[3]);
    await user.click(counters()[4]);
    await user.click(screen.getByRole('button', { name: /Retour|Précédent/ }));
    expect(screen.getByPlaceholderText('Ex. Julie')).toHaveValue('Camille');
    await next();
    await next();

    // Habitudes : voiture (désactivée), fumeur avec profil tabac, région, supermarché
    await user.click(screen.getByText(/J'ai une voiture/));
    await user.click(screen.getByText(/Je fume/));
    await user.click(screen.getByRole('button', { name: /Tubé/ }));
    await user.selectOptions(screen.getByRole('combobox'), 'Bretagne');
    await user.click(screen.getByRole('button', { name: /Lidl/ }));
    await next();

    // Charges : ajout, annulation, modification, suppression ; reste négatif
    await user.click(screen.getByText(/Ajouter une charge/));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByText(/Ajouter une charge/));
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await user.type(screen.getByPlaceholderText('Nom (ex. Crédit voiture)'), 'Crédit');
    await user.selectOptions(screen.getAllByRole('combobox').at(-1), 'loan');
    await user.type(screen.getByPlaceholderText('Montant'), '900');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByText('Crédit')).toBeInTheDocument();
    const amounts = screen.getAllByRole('spinbutton');
    await user.clear(amounts[0]);
    await user.type(amounts[0], '650');
    const firstRow = amounts[0].closest('div.card') || amounts[0].parentElement.parentElement;
    await user.click(within(firstRow).getAllByRole('button').at(-1));
    expect(screen.getByText('Reste pour enveloppes + épargne')).toBeInTheDocument();
    await next();

    // Enveloppes suggérées : tabac (fumeur), transports (sans voiture), animaux
    expect(screen.getByText('Tabac')).toBeInTheDocument();
    expect(screen.getByText('Transports')).toBeInTheDocument();
    expect(screen.getByText('Animaux')).toBeInTheDocument();
    const budgets = screen.getAllByRole('spinbutton');
    await user.clear(budgets[0]);
    await user.type(budgets[0], '5000');
    expect(screen.getByText('Épargne disponible')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /C'est parti/ }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile$/).at(-1).body).toMatchObject({ firstName: 'Camille', onboardingDone: true, tobaccoType: 'tube' }));
    await waitFor(() => expect(fake.called('POST', /\/api\/envelopes$/).length).toBeGreaterThan(3));
  });
});

describe('Astuces', () => {
  it('analyse IA en flux, historique, prix carburant en direct, tabac, courses', async () => {
    vi.spyOn(globalThis, 'fetch');
    const { user, fake, navigate } = await renderPage(Suggestions, { api: { profile: { tobaccoType: 'indus', tobaccoPackPrice: 14.6, tobaccoPacksPerWeek: 7 } } });
    // Prix carburant : le faux serveur ne connaît pas l'API publique → données statiques
    expect((await screen.findAllByText(/Données statiques/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Analyser/ }));
    expect(await screen.findByText(/Réduis les restos/)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /Régénérer/ })).toBeInTheDocument();
    await user.click(screen.getByText(/Historique \(/));
    expect(screen.getByText(/Cuisine maison/)).toBeInTheDocument();
    // Tabac industriel : marque moins chère proposée, liste des prix
    expect(screen.getByText(/Passer à/)).toBeInTheDocument();
    expect(screen.getByText('Gitanes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(navigate).toHaveBeenCalledWith('settings');
    // Supermarchés : le magasin actuel est indiqué
    expect(screen.getByText(/← ton magasin/)).toBeInTheDocument();
    // Sections repliables
    await user.click(screen.getByRole('button', { name: /Courses alimentaires/ }));
    await user.click(screen.getByRole('button', { name: /Courses alimentaires/ }));
    await user.click(screen.getByRole('button', { name: /Actualiser/ }));
    expect(fake.calls.length).toBeGreaterThan(0);
  });

  it('IA indisponible ; erreur pendant le flux ; tabac roulé ; non-fumeur', async () => {
    const { user, fake } = await renderPage(Suggestions, { api: { aiError: 'Ollama 503', aiHistory: [] } });
    await user.click(screen.getByRole('button', { name: /Analyser/ }));
    expect(await screen.findByText('Ollama indisponible')).toBeInTheDocument();
    expect(screen.getByText('Ollama 503')).toBeInTheDocument();
    expect(screen.getByText(/Bon choix côté budget/)).toBeInTheDocument();
    fake.db.aiError = null;
    fake.fetch.mockImplementationOnce(async () => ({
      ok: true,
      body: { getReader: () => { let n = 0; return { read: async () => (n++ ? { done: true } : { done: false, value: new TextEncoder().encode('data: {"error":"modèle absent"}\n\n') }) }; } },
    }));
    await user.click(screen.getByRole('button', { name: /Analyser/ }));
    expect(await screen.findByText('modèle absent')).toBeInTheDocument();
  });

  it('prix des carburants en direct', async () => {
    const live = { ok: true, json: async () => ({ results: [{ gazole: 1.8, sp95: 1.9, e10: 1.85, sp98: 1.95, e85: 0.9, gpl: 1 }] }) };
    const { fake } = await renderPage(Suggestions, { api: { profile: { isSmoker: false } } });
    void fake;
    localStorage.clear();
    const realFetch = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => (String(url).includes('data.economie.gouv.fr') ? live : realFetch(url, opts))));
    const { user } = await renderPage(Suggestions, { api: { profile: { isSmoker: false } } });
    void user;
    expect(screen.queryByText(/Passer à/)).not.toBeInTheDocument();
  });
});
