import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import Charges from '../Charges';
import Goals from '../Goals';
import { renderPage, field } from '../../test/render';

const cardOf = text => screen.getAllByText(text).map(e => e.closest('.card')).filter(Boolean).at(-1);

describe('Charges fixes', () => {
  it('total mensuel, provisions, échéances, fins prévues, charges terminées', async () => {
    const { user } = await renderPage(Charges);
    // 700 + 120/12 + 90/3 + 100 (épargne programmée) ; crédit terminé exclu
    expect(screen.getByText('840 €')).toBeInTheDocument();
    expect(screen.getByText(/mis de côté pour 2 charges/)).toBeInTheDocument();
    expect(screen.getByText(/ce mois-ci : Assurance habitation/)).toBeInTheDocument();
    expect(within(cardOf('Loyer')).getByText(/payé le 5 nov/)).toBeInTheDocument();
    expect(within(cardOf('Assurance habitation')).getByText('prélevé ce mois-ci')).toBeInTheDocument();
    expect(within(cardOf('Box')).getByText(/jusqu'en février 2027 · encore 4 mois/)).toBeInTheDocument();
    expect(within(cardOf('Box')).getByText('prélevé ce mois-ci')).toBeInTheDocument();
    expect(screen.getByText('Fins prévues')).toBeInTheDocument();
    expect(screen.queryByText('Crédit terminé')).not.toBeInTheDocument();
    await user.click(screen.getByText(/Terminées \(1\)/));
    expect(within(cardOf('Crédit terminé')).getByText(/terminée en juin 2026/)).toBeInTheDocument();
  });

  it('ajouter, modifier, supprimer une charge', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, fake } = await renderPage(Charges);
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await user.type(field('Nom'), 'Netflix');
    await user.click(screen.getByRole('button', { name: 'Annuel' }));
    await user.type(field(/Montant par an/), '99');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter' }).at(-1));
    await waitFor(() => expect(fake.called('POST', /\/api\/charges$/)).toHaveLength(1));
    expect(fake.called('POST', /\/api\/charges$/)[0].body).toMatchObject({ name: 'Netflix', amount: 99, frequency: 'yearly' });

    const loyer = cardOf('Loyer');
    await user.click(within(loyer).getAllByRole('button')[0]);
    expect(field('Nom')).toHaveValue('Loyer');
    await user.clear(field(/Montant par mois/));
    await user.type(field(/Montant par mois/), '720');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(fake.called('PUT', /\/api\/charges\/fc-loyer/)).toHaveLength(1));

    await user.click(within(cardOf('Loyer')).getAllByRole('button')[1]);
    await waitFor(() => expect(fake.called('DELETE', /\/api\/charges\/fc-loyer/)).toHaveLength(1));

    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
  });

  it('aucune charge ; catégorie inconnue regroupée à part', async () => {
    await renderPage(Charges, { api: { fixedCharges: [] } });
    expect(screen.getByText('Aucune charge fixe')).toBeInTheDocument();
  });

  it('charge dans une catégorie inconnue', async () => {
    await renderPage(Charges, { api: { fixedCharges: [{ id: 'x', name: 'Mystère', amount: 10, categoryId: 'zzz' }] } });
    expect(screen.getByText('Mystère')).toBeInTheDocument();
  });
});

describe('Objectifs', () => {
  it('cartes : en retard, atteint, versement conseillé ; encart budget', async () => {
    await renderPage(Goals);
    expect(await screen.findByText('Vacances')).toBeInTheDocument();
    expect(screen.getByText(/En retard/)).toBeInTheDocument();
    expect(screen.getByText(/il manque/)).toBeInTheDocument();
    expect(screen.getByText(/Objectif atteint/)).toBeInTheDocument();
    expect(screen.getByText(/Mettre de côté/)).toBeInTheDocument();
    expect(screen.getByText('Tes objectifs et ton budget')).toBeInTheDocument();
  });

  it('créer (avec calcul du versement nécessaire), modifier, verser, supprimer', async () => {
    const { user, fake } = await renderPage(Goals);
    await screen.findByText('Vacances');
    await user.click(screen.getByRole('button', { name: /Nouveau/ }));
    await user.click(screen.getByRole('button', { name: '🎸' }));
    await user.type(field("Nom de l'objectif"), 'Concert');
    await user.type(field('Montant cible (€)'), '600');
    await user.type(field('Date cible (optionnel)'), '2027-05-01');
    expect(screen.getByText(/Pour tenir la date : 100 €\/mois/)).toBeInTheDocument();
    await user.type(field(/Versement mensuel prévu/), '150');
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    await waitFor(() => expect(fake.called('POST', /\/api\/goals$/)).toHaveLength(1));
    expect(fake.called('POST', /\/api\/goals$/)[0].body).toMatchObject({ name: 'Concert', icon: '🎸', monthlyContribution: 150 });
    expect(await screen.findByText(/objectif atteint en/)).toBeInTheDocument();

    const card = screen.getByText('Vacances').closest('.card');
    await user.click(within(card).getAllByRole('button')[0]);
    await user.clear(field("Nom de l'objectif"));
    await user.type(field("Nom de l'objectif"), 'Grandes vacances');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Grandes vacances')).toBeInTheDocument();

    const card2 = screen.getByText('Grandes vacances').closest('.card');
    await user.click(within(card2).getByText('Ajouter un versement'));
    await user.type(screen.getByPlaceholderText('0'), '50');
    expect(screen.getByText(/Nouveau total : 250 €/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(fake.called('PATCH', /\/deposit/)).toHaveLength(1));

    await user.click(within(screen.getByText('Grandes vacances').closest('.card')).getAllByRole('button')[1]);
    await waitFor(() => expect(fake.called('DELETE', /\/api\/goals\//)).toHaveLength(1));
  });

  it('aucun objectif ; échéance dépassée ; erreurs réseau silencieuses', async () => {
    const { user, fake } = await renderPage(Goals, { api: { goals: [{ id: 'g', name: 'Vieux', targetAmount: 100, currentAmount: 10, targetDate: '2026-01-01', icon: '🎯' }] } });
    expect(await screen.findByText(/Échéance dépassée/)).toBeInTheDocument();
    expect(screen.getByText(/échéance atteinte, il reste/)).toBeInTheDocument();
    fake.db.down = true;
    await user.click(screen.getByRole('button', { name: /Nouveau/ }));
    await user.type(field("Nom de l'objectif"), 'X');
    await user.type(field('Montant cible (€)'), '10');
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    expect(screen.getByRole('button', { name: 'Créer' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(within(screen.getByText('Vieux').closest('.card')).getByText('Ajouter un versement'));
    await user.type(screen.getByPlaceholderText('0'), '5');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    expect(screen.getByText(/Versement — Vieux/)).toBeInTheDocument();
  });

  it('liste vide', async () => {
    await renderPage(Goals, { api: { goals: [] } });
    expect((await screen.findAllByText(/Définis tes projets/)).length).toBeGreaterThan(0);
  });
});
