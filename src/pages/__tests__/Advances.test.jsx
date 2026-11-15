import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import Advances from '../Advances';
import { renderPage, field } from '../../test/render';

describe('Avances', () => {
  it('total dû, détail par personne, remboursement d\'une personne entière', async () => {
    const { user, fake } = await renderPage(Advances);
    expect(screen.getByText('On te doit')).toBeInTheDocument();
    expect(screen.getByText('51 €')).toBeInTheDocument();
    const lea = screen.getAllByText('Léa')[0].closest('div');
    expect(within(lea).getByText('32,50 €')).toBeInTheDocument();
    await user.click(within(lea).getByText('Tout remboursé'));
    await waitFor(() => expect(fake.called('PUT', /\/api\/advances\/a1\/repaid/)).toHaveLength(1));
    expect(await screen.findByText('18 €')).toBeInTheDocument();
  });

  it('ajouter une avance, marquer remboursée puis annuler, supprimer', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { user, fake } = await renderPage(Advances);
    await user.click(screen.getByRole('button', { name: /Ajouter/ }));
    await user.type(field('Pour qui ?'), 'Max');
    await user.type(field('Montant (€)'), '12');
    await user.type(field('Note (optionnel)'), 'Pizza');
    await user.click(screen.getAllByRole('button', { name: 'Ajouter' }).at(-1));
    await waitFor(() => expect(fake.called('POST', /\/api\/advances$/)).toHaveLength(1));
    expect(fake.calls.find(c => c.method === 'POST').body).toMatchObject({ person: 'Max', amount: 12 });

    await user.click(screen.getAllByTitle('Marquer remboursé')[0]);
    await user.click(screen.getByText(/Remboursées/));
    await user.click(screen.getAllByTitle('Annuler le remboursement')[0]);
    await user.click(screen.getAllByTitle('Supprimer')[0]);
    await waitFor(() => expect(fake.called('DELETE', /\/api\/advances\//)).toHaveLength(1));
  });

  it('aucune avance : message d\'accueil', async () => {
    await renderPage(Advances, { api: { advances: [] } });
    expect(screen.getByText('Aucune avance')).toBeInTheDocument();
  });
});
