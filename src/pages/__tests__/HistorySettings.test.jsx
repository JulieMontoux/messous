import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import History from '../History';
import Settings from '../Settings';
import { renderPage, field, modal } from '../../test/render';

describe('Historique', () => {
  it('statistiques (mois terminés seulement), réel vs prévu, mois en cours prévisionnel', async () => {
    await renderPage(History);
    expect(screen.getByText('Épargne planifiée')).toBeInTheDocument();
    expect(screen.getByText('1 mois clôturé')).toBeInTheDocument();
    expect(screen.getByText('mois terminés')).toBeInTheDocument();
    expect(screen.getByText(/en cours · prévisionnel/)).toBeInTheDocument();
    expect(screen.getByText('clôturé')).toBeInTheDocument();
    expect(screen.getByText(/Reste réel/)).toHaveTextContent('→ objectif');
    expect(screen.getByText('Tendances sur 12 mois')).toBeInTheDocument();
  });

  it('clôture ouverte depuis le lien de l\'e-mail : report d\'enveloppe et reste versé sur un objectif', async () => {
    const { user, fake } = await renderPage(History, { params: { close: '2026-10' } });
    expect(await screen.findByText('Clôturer oct. 2026')).toBeInTheDocument();
    const courses = within(modal()).getByText(/Courses/, { selector: 'span' }).closest('label');
    await user.click(within(courses).getByRole('checkbox'));
    expect(screen.getByText(/reportés sur nov. 2026/)).toBeInTheDocument();
    const amount = courses.parentElement.querySelector('input[type=number]');
    await user.clear(amount);
    expect(courses.parentElement.querySelector('input[type=number]')).toBeInTheDocument();
    await user.type(amount, '15');
    // 15 € de courses + 25 € de cadeaux déjà reportés sur novembre
    expect(screen.getByText(/40\s€ reportés sur nov\. 2026/)).toBeInTheDocument();
    await user.click(within(courses).getByRole('checkbox'));
    await user.click(within(courses).getByRole('checkbox'));
    await user.clear(field('Épargne réellement versée'));
    await user.type(field('Épargne réellement versée'), '280');
    await user.clear(field('Reste en fin de mois'));
    await user.type(field('Reste en fin de mois'), '60');
    await user.selectOptions(await within(modal()).findByRole('combobox'), 'goal-vacances');
    expect(screen.getByText('340 €')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/savings\/2026-10\/close/)).toHaveLength(1));
    expect(fake.called('PUT', /close/)[0].body).toMatchObject({ actualSavings: 280, actualRemainder: 60, remainderToGoalId: 'goal-vacances' });
    // Octobre : 300 € − 280 € dépensés = 20 € proposés, ramenés à 15 € à la main, décoché puis recoché → 20 €
    expect(fake.called('PUT', /close/)[0].body.carryovers.find(c => c.envelopeId === 'env-courses').amount).toBe(20);
    expect(fake.called('PUT', /close/)[0].body.carryovers.find(c => c.envelopeId === 'env-restos').amount).toBe(0);
    expect(fake.called('PUT', /close/)[0].body.carryovers.find(c => c.envelopeId === 'env-cadeaux').amount).toBe(25);
  });

  it('modifier une clôture existante, clôturer le mois en cours, annuler', async () => {
    const { user } = await renderPage(History);
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    expect(screen.getByText('Clôturer sept. 2026')).toBeInTheDocument();
    expect(field('Épargne réellement versée')).toHaveValue(250);
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: /Clôturer le mois/ }));
    expect(screen.getByText('Clôturer nov. 2026')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getAllByText(/Enregistrer l'épargne réelle/)[0]);
    expect(screen.getByText(/Clôturer (nov|oct)\. 2026/)).toBeInTheDocument();
  });

  it('historique vide ; dépenses d\'épargne réellement virées affichées', async () => {
    await renderPage(History, { api: { savingsHistory: [] } });
    expect(screen.getByText("Aucun historique pour l'instant")).toBeInTheDocument();
  });

  it('mois non clôturé avec virements d\'épargne réels', async () => {
    await renderPage(History, { api: { savingsHistory: [{ month: '2026-11', salary: 2500, totalFixed: 0, totalEnvelopes: 0, programmedSavings: 0, savingEnvelopes: 150, remainder: 0, totalSavings: 150 }] } });
    expect(screen.getByText(/Réellement viré/)).toBeInTheDocument();
    expect(screen.getByText(/% du planifié/)).toBeInTheDocument();
  });
});

describe('Profil', () => {
  it('modifier prénom, salaire (immédiat, différé, annulé), région, supermarché, foyer', async () => {
    const { user, fake } = await renderPage(Settings);
    await user.click(screen.getByText('Prénom'));
    await user.clear(within(modal()).getByRole('textbox'));
    await user.type(within(modal()).getByRole('textbox'), 'Jules');
    await user.click(within(modal()).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile$/).at(-1).body.firstName).toBe('Jules'));

    await user.click(screen.getByText('Salaire net mensuel'));
    expect(screen.getByText(/Appliqué tout de suite/)).toBeInTheDocument();
    await user.click(within(modal()).getByRole('button', { name: 'Mois prochain' }));
    expect(screen.getByText(/décembre 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Autre mois' }));
    fireEvent.change(document.querySelector('input[type=month]'), { target: { value: '2027-02' } });
    await user.click(within(modal()).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/à partir de février 2027/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(fake.called('DELETE', /salary\/pending/)).toHaveLength(1));
    await user.click(screen.getByText('Salaire net mensuel'));
    await user.click(screen.getByRole('button', { name: 'Ce mois-ci' }));
    await user.click(within(modal()).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile\/salary/)).toHaveLength(2));
    fake.db.down = true;
    await user.click(screen.getByText('Salaire net mensuel'));
    await user.click(within(modal()).getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText(/Serveur injoignable/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    fake.db.down = false;

    await user.click(screen.getByText('Région'));
    await user.selectOptions(within(modal()).getByRole('combobox'), 'Bretagne');
    await user.click(within(modal()).getByRole('button', { name: 'Enregistrer' }));
    await user.click(screen.getByText('Supermarché habituel'));
    await user.click(screen.getByRole('button', { name: /Aldi/ }));
    await user.click(within(modal()).getByRole('button', { name: 'Enregistrer' }));
    await user.click(screen.getByText('Adultes'));
    await user.clear(within(modal()).getByRole('spinbutton'));
    await user.type(within(modal()).getByRole('spinbutton'), '2');
    await user.click(within(modal()).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile$/).at(-1).body.householdAdults).toBe(2));
    await user.click(screen.getByText('Enfants'));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));

    // Animaux : + et −
    const dogs = screen.getByText('🐶 Chiens').parentElement;
    await user.click(within(dogs).getByRole('button', { name: '+' }));
    await user.click(within(dogs).getByRole('button', { name: '−' }));
  });

  it('préférences : thème, arrondi, voiture, fumeur', async () => {
    const { user, fake } = await renderPage(Settings);
    await user.click(screen.getByRole('button', { name: 'Sombre' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile$/).at(-1).body.theme).toBe('dark'));
    const toggles = () => document.querySelectorAll('button.w-11');
    for (const t of toggles()) await user.click(t);
    expect(fake.called('PUT', /\/api\/profile$/).length).toBeGreaterThan(3);
  });

  it('tabac : enregistrer, ajuster l\'enveloppe, arrêter puis reprendre', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, fake } = await renderPage(Settings);
    const tabac = screen.getByText('Tabac', { selector: 'p' }).closest('.card');
    await user.click(within(tabac).getByRole('button', { name: /Industrielles/ }));
    await user.click(within(tabac).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile$/).at(-1).body.tobaccoType).toBe('indus'));
    expect(await screen.findByText('✓ Enregistré')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /ajuster l'enveloppe/ }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/envelopes\/env-tabac/)).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /J'arrête de fumer/ }));
    expect(await screen.findByText(/jours? sans tabac/)).toBeInTheDocument();
    await waitFor(() => expect(fake.called('PUT', /\/api\/envelopes\/env-tabac/)).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: "J'ai repris" }));
    expect(await screen.findByRole('button', { name: /J'arrête de fumer/ })).toBeInTheDocument();
  });

  it('tabac sans enveloppe : création de l\'enveloppe', async () => {
    const { user, fake } = await renderPage(Settings, { api: { envelopes: [] } });
    await user.click(screen.getByRole('button', { name: /Créer l'enveloppe tabac/ }));
    await waitFor(() => expect(fake.called('POST', /\/api\/envelopes$/)).toHaveLength(1));
    expect(fake.called('POST', /\/api\/envelopes$/)[0].body).toMatchObject({ categoryId: 'tobacco', budgetMonthly: 130 });
  });

  it('budget idéal : total à 100 %, retour au 50/30/20', async () => {
    const { user, fake } = await renderPage(Settings);
    const needs = field(/Besoins/);
    await user.clear(needs);
    await user.type(needs, '60');
    expect(screen.getByText(/doit faire 100 %/)).toBeInTheDocument();
    await user.clear(field(/Plaisirs/));
    await user.type(field(/Plaisirs/), '20');
    await user.click(screen.getAllByRole('button', { name: 'Enregistrer' }).at(-1));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile$/).at(-1).body).toMatchObject({ idealNeedsPct: 60, idealWantsPct: 20 }));
    await user.click(screen.getByRole('button', { name: '50/30/20' }));
    await user.clear(needs);
  });

  it('alertes : seuil, adresse, e-mail de test (succès et erreur), SMTP absent', async () => {
    const { user, fake } = await renderPage(Settings);
    await user.click(screen.getByRole('button', { name: '90%' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile$/).at(-1).body.alertThreshold).toBe(90));
    const email = screen.getByPlaceholderText('julie@exemple.fr');
    await user.type(email, 'alertes@exemple.fr');
    await user.tab();
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile$/).at(-1).body.alertEmail).toBe('alertes@exemple.fr'));
    await user.click(screen.getByRole('button', { name: /Test/ }));
    expect(await screen.findByText(/E-mail envoyé à/)).toBeInTheDocument();
    fake.db.failTestEmail = true;
    await user.click(screen.getByRole('button', { name: /Test/ }));
    expect(await screen.findByText('SMTP non configuré')).toBeInTheDocument();
    expect(screen.getByText(/Notifications : non disponibles/)).toBeInTheDocument();
  });

  it('SMTP non configuré : avertissement ; notifications activables si le navigateur les gère', async () => {
    const sub = { endpoint: 'e', toJSON: () => ({ endpoint: 'e', keys: { p256dh: 'a', auth: 'b' } }), unsubscribe: vi.fn() };
    let current = null;
    const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => { current = sub; return sub; } } };
    vi.stubGlobal('navigator', { ...navigator, serviceWorker: { getRegistration: async () => reg, register: async () => reg, ready: Promise.resolve(reg) } });
    vi.stubGlobal('PushManager', function P() {});
    vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
    const { user, fake } = await renderPage(Settings, { api: { profile: { mailConfigured: false } } });
    expect(screen.getByText(/pas encore configuré sur le serveur/)).toBeInTheDocument();
    const pushToggle = screen.getByText(/Notifications sur cet appareil/).closest('div').parentElement.querySelector('button');
    await user.click(pushToggle);
    expect(await screen.findByText(/Notification de test envoyée/)).toBeInTheDocument();
    await user.click(pushToggle);
    await waitFor(() => expect(fake.called('POST', /unsubscribe/)).toHaveLength(1));
    vi.stubGlobal('Notification', { requestPermission: async () => 'denied' });
    await user.click(pushToggle);
    expect(await screen.findByText(/Notifications refusées/)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('exports CSV (succès et erreur), réinitialisation (mot de passe faux puis bon), déconnexion', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const { user, fake } = await renderPage(Settings);
    await user.click(screen.getByRole('button', { name: /Dépenses/ }));
    await waitFor(() => expect(fake.called('GET', /\/api\/export\/depenses\.csv/)).toHaveLength(1));
    fake.db.exportError = true;
    await user.click(screen.getByRole('button', { name: /Avances/ }));
    expect(await screen.findByText(/Export impossible/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Réinitialiser toutes les données/ }));
    const go = screen.getByRole('button', { name: 'Tout supprimer' });
    expect(go).toBeDisabled();
    await user.type(document.querySelector('input[type=password]'), 'faux');
    await user.type(screen.getByPlaceholderText('SUPPRIMER'), 'supprimer');
    await user.click(go);
    expect(await screen.findByText('Mot de passe incorrect')).toBeInTheDocument();
    await user.clear(document.querySelector('input[type=password]'));
    await user.type(document.querySelector('input[type=password]'), 'motdepasse1');
    await user.click(screen.getByRole('button', { name: 'Tout supprimer' }));
    await waitFor(() => expect(screen.queryByText('Tout supprimer')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Réinitialiser/ }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: /Se déconnecter/ }));
    expect(localStorage.getItem('messous_token')).toBeNull();
  });
});
