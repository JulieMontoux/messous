import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import Dashboard from '../Dashboard';
import Envelopes from '../Envelopes';
import { renderPage, field, modal } from '../../test/render';

describe('Tableau de bord', () => {
  it('dépenses du mois, prévision zen, fin de mois prévue avec prélèvements, tabac, bandeaux', async () => {
    const { user, navigate, fake } = await renderPage(Dashboard);
    expect(screen.getByText('Dépensé ce mois-ci')).toBeInTheDocument();
    // La carte attend les comptes bancaires (chargés à part)
    expect(await screen.findByText('Fin de mois prévue')).toBeInTheDocument();
    expect(screen.getByText('1 840,25 €')).toBeInTheDocument();
    expect(screen.getByText('Prélèvements à venir')).toBeInTheDocument();
    expect(screen.getByText('Assurance habitation')).toBeInTheDocument();
    expect(screen.getByText(/blagues? ce mois-ci/)).toBeInTheDocument();
    // Octobre non clôturé → bandeau de clôture
    await user.click(screen.getByText('Clôture octobre'));
    expect(navigate).toHaveBeenCalledWith('history', { close: '2026-10' });
    // Paiements carte à classer → lien vers la banque
    await user.click(screen.getByText(/à classer →/));
    expect(navigate).toHaveBeenCalledWith('bank');
    // Salaire différent repéré sur le relevé
    expect(screen.getByText(/Salaire reçu le 30 oct\..*2 580 €/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile\/salary/)[0].body).toMatchObject({ amount: 2580, from: '2026-11' }));
    expect(screen.queryByText(/Salaire reçu/)).not.toBeInTheDocument();
    // Vue hebdo
    await user.click(screen.getByRole('button', { name: 'Hebdo' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/settings/)).toHaveLength(1));
  });

  it('salaire ignoré, solde saisi à la main, dernier jour du mois, arrêt du tabac', async () => {
    const { user, fake } = await renderPage(Dashboard, {
      date: '2026-11-30T12:00:00',
      api: {
        bankStatus: { providerConfigured: false, connections: [], accounts: [], rules: [] },
        profile: { tobaccoQuitDate: '2026-11-20' },
        savingsHistory: [{ month: '2026-10', closedAt: 'x', totalSavings: 1 }],
      },
    });
    expect(screen.getByText(/Dernier jour de novembre/)).toBeInTheDocument();
    expect(screen.getByText(/10 jours sans tabac/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ignorer' }));
    expect(localStorage.getItem('messous_salary_dismissed')).toBe('b-sal');
    expect(await screen.findByText('Indique ton solde pour voir la prévision')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Saisir/ }));
    await user.type(within(screen.getByText('Fin de mois prévue').closest('div.rounded-2xl')).getByRole('spinbutton'), '900');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/profile\/balance/)[0].body.balance).toBe(900));
    expect(await screen.findByText(/le 30 novembre/)).toBeInTheDocument();
  });

  it('début de mois, dépassement, déficit, sans salaire ni tabac', async () => {
    await renderPage(Dashboard, {
      date: '2026-11-02T12:00:00',
      api: {
        profile: { isSmoker: false, netSalary: 500 },
        transactions: [{ id: 'x', envelopeId: 'env-courses', amount: 900, date: '2026-11-01', paymentMethod: 'card' }],
        bankTransactions: [],
        fixedCharges: [],
      },
    });
    expect(screen.getByText(/Enveloppes dépassées de/)).toBeInTheDocument();
    expect(screen.getByText(/Budget prévisionnel en déficit/)).toBeInTheDocument();
    expect(await screen.findByText(/Toutes les charges fixes du mois sont passées/)).toBeInTheDocument();
  });

  it('rythme soutenu en cours de mois : message rassurant ; tout va bien : tranquille', async () => {
    await renderPage(Dashboard, {
      api: { transactions: [{ id: 'x', envelopeId: 'env-courses', amount: 500, date: '2026-11-10', paymentMethod: 'card' }], bankTransactions: [] },
    });
    expect(screen.getByText(/Rythme un peu soutenu/)).toBeInTheDocument();
  });

  it('dépenses faibles : « Tranquille »', async () => {
    await renderPage(Dashboard, { api: { transactions: [], bankTransactions: [] } });
    expect(screen.getByText(/Tranquille/)).toBeInTheDocument();
  });
});

const envCard = name => screen.getAllByText(name, { selector: 'p' }).map(e => e.closest('.card')).at(-1);

describe('Enveloppes', () => {
  it('cartes : reste, report, prévision, dépenses de la période', async () => {
    const { user } = await renderPage(Envelopes);
    const courses = envCard('Courses');
    expect(within(courses).getByText('150 €')).toBeInTheDocument();
    expect(within(envCard('Cadeaux')).getByText(/dont 25\s€ reporté/)).toBeInTheDocument();
    expect(within(envCard('Restos')).getByText(/Dépassé de 15/)).toBeInTheDocument();
    expect(within(envCard('Livret A')).getByText(/à verser/)).toBeInTheDocument();
    await user.click(within(courses).getByText(/2 dépenses/));
    expect(within(courses).getByText('Marché')).toBeInTheDocument();
    expect(screen.getByText('Retraits réels')).toBeInTheDocument();
    expect(screen.getByText(/conseillé 55/)).toBeInTheDocument();
    expect(screen.getByText(/🏦 banque/)).toBeInTheDocument();
  });

  it('vue hebdomadaire calée sur le dernier retrait', async () => {
    const { user, fake } = await renderPage(Envelopes);
    await user.click(screen.getAllByRole('button', { name: 'Hebdomadaire' })[0]);
    expect(await screen.findByText(/calée sur ton retrait du 12 nov/)).toBeInTheDocument();
    await waitFor(() => expect(fake.called('PUT', /\/api\/settings/)).toHaveLength(1));
  });

  it('semaine raccourcie par la clôture du mois précédent ; sans retrait : semaine du lundi', async () => {
    await renderPage(Envelopes, {
      date: '2026-11-02T12:00:00',
      api: { settings: { view_mode: 'weekly' }, withdrawals: [{ id: 'w', date: '2026-10-30', amount: 50 }], savingsHistory: [{ month: '2026-10', closedAt: 'x' }] },
    });
    expect(screen.getByText(/le mois précédent est clôturé/)).toBeInTheDocument();
  });

  it('semaine sans retrait', async () => {
    await renderPage(Envelopes, { api: { settings: { view_mode: 'weekly' }, withdrawals: [] } });
    expect(screen.getByText(/enregistre un retrait pour caler la semaine/)).toBeInTheDocument();
  });

  it('créer, modifier, supprimer une enveloppe', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const { user, fake } = await renderPage(Envelopes);
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await user.selectOptions(field('Catégorie'), 'vacation');
    expect(field('Nom personnalisé')).toHaveValue('Vacances');
    await user.type(field('Budget mensuel (€)'), '87');
    expect(screen.getByText(/Soit 20\s€ \/ semaine/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fake.called('POST', /\/api\/envelopes$/)[0].body).toMatchObject({ name: 'Vacances', categoryId: 'vacation', budgetMonthly: 87 }));

    const restos = envCard('Restos');
    await user.click(within(restos).getByTitle('Modifier'));
    await user.clear(field('Budget mensuel (€)'));
    await user.type(field('Budget mensuel (€)'), '150');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/envelopes\/env-restos/)[0].body.budgetMonthly).toBe(150));

    await user.click(within(envCard('Restos')).getByTitle('Supprimer'));
    expect(fake.called('DELETE', /\/api\/envelopes\//)).toHaveLength(0);
    await user.click(within(envCard('Restos')).getByTitle('Supprimer'));
    await waitFor(() => expect(fake.called('DELETE', /\/api\/envelopes\/env-restos/)).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
  });

  it('dépense en carte, dépense récurrente, suppression d\'une dépense', async () => {
    const { user, fake } = await renderPage(Envelopes);
    const courses = envCard('Courses');
    await user.click(within(courses).getByTitle('Ajouter une dépense'));
    await user.type(screen.getByPlaceholderText('0.00'), '12.5');
    await user.click(screen.getByRole('button', { name: /Carte/ }));
    await user.type(screen.getByPlaceholderText('Ex. Carrefour, Total, …'), 'Boulangerie');
    await user.click(screen.getByText('Dépense récurrente'));
    await user.clear(field(/Jour du mois/));
    await user.type(field(/Jour du mois/), '40');
    expect(screen.getByText(/le 28 de chaque mois/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fake.called('POST', /\/api\/transactions$/)[0].body).toMatchObject({ amount: 12.5, paymentMethod: 'card', note: 'Boulangerie' }));
    await waitFor(() => expect(fake.called('POST', /\/api\/recurring$/)[0].body.dayOfMonth).toBe(28));

    await user.click(within(envCard('Courses')).getByText(/dépenses/));
    // Le premier « Supprimer » de la carte est celui de l'enveloppe : on vise celui d'une dépense
    await user.click(within(envCard('Courses')).getAllByTitle('Supprimer').at(-1));
    await waitFor(() => expect(fake.called('DELETE', /\/api\/transactions\//)).toHaveLength(1));
    await user.click(within(envCard('Tabac')).getByTitle('Ajouter une dépense'));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
  });

  it('retrait : budget idéal / enveloppes, mensuel / hebdo, enregistrement avec écart, suppression', async () => {
    const { user, fake } = await renderPage(Envelopes);
    await user.click(screen.getByRole('button', { name: /Retrait/ }));
    const m = modal();
    expect(within(m).getByText('Total besoins')).toBeInTheDocument();
    expect(within(m).getByText(/idéal 50 % du disponible/)).toBeInTheDocument();
    expect(within(m).getByText('Déjà retiré sur la période')).toBeInTheDocument();
    await user.click(within(m).getByRole('button', { name: /Mes enveloppes/ }));
    expect(within(m).getAllByText(/Courses|Restos/).length).toBeGreaterThan(0);
    expect(within(m).getByText(/montant barré = déjà couvert/)).toBeInTheDocument();
    await user.click(within(m).getByRole('button', { name: 'Hebdomadaire' }));
    expect(within(m).getByText('/ semaine')).toBeInTheDocument();
    await user.click(within(m).getByRole('button', { name: /Budget idéal/ }));
    const amount = within(m).getByPlaceholderText(/^\d+$/);
    await user.type(amount, '35');
    expect(within(m).getByText(/Écart avec le conseillé/)).toBeInTheDocument();
    await user.click(within(m).getByRole('button', { name: /J'ai retiré 35/ }));
    await waitFor(() => expect(fake.called('POST', /\/api\/withdrawals$/)[0].body).toMatchObject({ amount: 35, mode: 'weekly' }));

    const card = screen.getByText('Retraits réels').closest('.card');
    await user.click(within(card).getAllByTitle('Supprimer')[0]);
    await waitFor(() => expect(fake.called('DELETE', /\/api\/withdrawals\//)).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Retrait/ }));
    await user.click(within(modal()).getByRole('button', { name: 'Fermer' }));
  });

  it('retrait sans arrondi (profil) ; aucune enveloppe', async () => {
    const { user } = await renderPage(Envelopes, { api: { profile: { roundWithdrawals: false }, withdrawals: [] } });
    await user.click(screen.getByRole('button', { name: /Retrait/ }));
    expect(within(modal()).getByText('Total à retirer')).toBeInTheDocument();
  });

  it('aucune enveloppe', async () => {
    await renderPage(Envelopes, { api: { envelopes: [] } });
    expect(screen.getByText('Aucune enveloppe')).toBeInTheDocument();
  });
});
