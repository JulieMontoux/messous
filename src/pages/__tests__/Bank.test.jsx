import { describe, it, expect, vi } from 'vitest';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import Bank from '../Bank';
import { renderPage, field, modal } from '../../test/render';

const row = label => screen.getByText(label).closest('div.py-3');
// La page recharge comptes, règles et opérations à l'ouverture
const loaded = () => screen.findByRole('button', { name: /Synchroniser/ });

describe('Banque', () => {
  it('synthèse du mois, comptes, connexions, règles, bandeau après connexion', async () => {
    const { user } = await renderPage(Bank, { params: { bank: 'ok' } });
    await loaded();
    expect(screen.getByText(/Banque connectée/)).toBeInTheDocument();
    await user.click(screen.getByText(/Banque connectée/).parentElement.querySelector('button'));
    expect(screen.queryByText(/Banque connectée/)).not.toBeInTheDocument();
    expect(await screen.findByText('Compte courant')).toBeInTheDocument();
    expect(screen.getByText('1 840,25 €')).toBeInTheDocument();
    expect(screen.getByText('FR76 1234 5678 9012 34')).toBeInTheDocument();
    expect(screen.getByText(/expirée — reconnecte-toi/)).toBeInTheDocument();
    expect(screen.getByText('Consentement expiré')).toBeInTheDocument();
    expect(screen.getByText('Classement automatique')).toBeInTheDocument();
    expect(screen.getByText('→ 📌 Loyer')).toBeInTheDocument();
    expect(screen.getByText('→ —')).toBeInTheDocument();
    expect(screen.getByText(/Dernière synchro/)).toBeInTheDocument();
  });

  it('retour de connexion en échec', async () => {
    await renderPage(Bank, { params: { bank: 'error' } });
    expect(screen.getByText(/La connexion à la banque a échoué/)).toBeInTheDocument();
  });

  it('filtres, recherche, étiquettes de classement', async () => {
    const { user } = await renderPage(Bank);
    await loaded();
    expect(screen.getByRole('button', { name: /À classer \(2\)/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Toutes' }));
    expect(screen.getByText('💶 Retrait d\'espèces', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/🤝 Avance · Léa/)).toBeInTheDocument();
    expect(screen.getAllByText(/📌 Loyer/, { selector: 'span' }).length).toBeGreaterThan(0);
    expect(screen.getByText('+2 580,00 €')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Filtrer par libellé/), 'lidl');
    expect(screen.getByText('CB LIDL')).toBeInTheDocument();
    expect(screen.queryByText('CB MONOPRIX 1311')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ignorées' }));
    expect(screen.getByText('Aucune opération')).toBeInTheDocument();
    await user.clear(screen.getByPlaceholderText(/Filtrer par libellé/));
    expect(screen.getByText('VIR LIVRET')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dépenses' }));
    expect(screen.getByText('CB CINEMA')).toBeInTheDocument();
  });

  it('classer une opération : enveloppe, charge fixe, retrait, avance, nouvelle charge', async () => {
    vi.spyOn(window, 'prompt').mockReturnValueOnce('Max').mockReturnValueOnce('');
    const { user, fake } = await renderPage(Bank);
    await loaded();
    // Enveloppe (sans retenir le marchand)
    const mono = row('CB MONOPRIX 1311');
    await user.selectOptions(within(mono).getByRole('combobox'), 'env:env-courses');
    await user.click(within(mono).getByRole('checkbox', { name: /toujours pour ce marchand/ }));
    await user.click(within(mono).getByRole('button', { name: 'Classer' }));
    await waitFor(() => expect(fake.called('POST', /b-todo\/assign/)[0].body).toMatchObject({ envelopeId: 'env-courses', remember: false }));

    // Charge fixe existante, en retenant le marchand
    const prlv = row('PRLV SEPA ASSUREUR');
    await user.selectOptions(within(prlv).getByRole('combobox'), 'fix:fc-assurance');
    await user.click(within(prlv).getByRole('button', { name: 'Classer' }));
    await waitFor(() => expect(fake.called('POST', /b-prlv\/assign/)[0].body).toMatchObject({ fixedChargeId: 'fc-assurance', remember: true }));
    expect(await screen.findByText('Tout est classé 🎉')).toBeInTheDocument();

    // Retirer, puis retrait d'espèces / avance (annulée puis Max)
    await user.click(screen.getByRole('button', { name: 'Toutes' }));
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: /Retirer/ }));
    await waitFor(() => expect(fake.called('POST', /b-todo\/unassign/)).toHaveLength(1));
    await within(row('CB MONOPRIX 1311')).findByRole('combobox');
    await user.selectOptions(within(row('CB MONOPRIX 1311')).getByRole('combobox'), 'advance');
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: 'Classer' }));
    await waitFor(() => expect(fake.called('POST', /b-todo\/assign/).at(-1).body).toMatchObject({ advance: { person: 'Max' } }));
    await within(row('CB MONOPRIX 1311')).findByText(/Avance · Max/);
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: /Retirer/ }));
    await within(row('CB MONOPRIX 1311')).findByRole('combobox');
    await user.selectOptions(within(row('CB MONOPRIX 1311')).getByRole('combobox'), 'advance');
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: 'Classer' }));
    await user.selectOptions(within(row('CB MONOPRIX 1311')).getByRole('combobox'), 'cash');
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: 'Classer' }));
    await waitFor(() => expect(fake.called('POST', /b-todo\/assign/).at(-1).body).toMatchObject({ asWithdrawal: true }));
    await within(row('CB MONOPRIX 1311')).findByText(/Retrait d'espèces/, { selector: 'span' });

    // Nouvelle charge fixe créée depuis un paiement
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: /Retirer/ }));
    await within(row('CB MONOPRIX 1311')).findByRole('combobox');
    await user.selectOptions(within(row('CB MONOPRIX 1311')).getByRole('combobox'), 'new-fix');
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: 'Classer' }));
    expect(field('Nom')).toHaveValue('Monoprix');
    await user.click(within(modal()).getByRole('button', { name: 'Annuel' }));
    await user.click(within(modal()).getByRole('button', { name: 'Créer et classer' }));
    expect(await screen.findByText(/Charge fixe « Monoprix » créée/)).toBeInTheDocument();
    // « CB CINEMA » est une avance : on la retire d'abord, puis on annule la création
    await user.click(within(row('CB CINEMA')).getByRole('button', { name: /Retirer/ }));
    await within(row('CB CINEMA')).findByRole('combobox');
    await user.selectOptions(within(row('CB CINEMA')).getByRole('combobox'), 'new-fix');
    await user.click(within(row('CB CINEMA')).getByRole('button', { name: 'Classer' }));
    await user.click(within(modal()).getByRole('button', { name: 'Annuler' }));
  });

  it('ignorer puis ne plus ignorer ; erreur de classement affichée', async () => {
    const { user, fake } = await renderPage(Bank);
    await loaded();
    await user.click(within(row('CB MONOPRIX 1311')).getByTitle(/Ignorer/));
    await waitFor(() => expect(fake.called('POST', /b-todo\/ignore/)[0].body.ignored).toBe(true));
    await user.click(screen.getByRole('button', { name: 'Ignorées' }));
    await user.click(within(row('CB MONOPRIX 1311')).getByText('Ne plus ignorer'));
    await waitFor(() => expect(fake.called('POST', /b-todo\/ignore/)).toHaveLength(2));
    await user.click(within(row('VIR LIVRET')).getByText('Ne plus ignorer'));
    await user.click(screen.getByRole('button', { name: /À classer/ }));
    fake.db.assignError = 'Enveloppe introuvable';
    await user.selectOptions(within(row('CB MONOPRIX 1311')).getByRole('combobox'), 'env:env-courses');
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: 'Classer' }));
    expect(await screen.findByText('Enveloppe introuvable')).toBeInTheDocument();
    fake.db.assignError = null;
  });

  it('classement en masse : tout cocher, classer, ignorer, retraits ; erreur', async () => {
    const { user, fake } = await renderPage(Bank);
    await loaded();
    await user.click(screen.getByLabelText('Tout'));
    const bar = () => screen.getByText(/sélectionnée/).closest('div.sticky');
    expect(within(bar()).getByText(/143,10 €/)).toBeInTheDocument();
    await user.click(within(bar()).getByText(/Désélectionner/));
    await user.click(within(row('CB MONOPRIX 1311')).getByLabelText('Sélectionner'));
    await user.click(within(row('CB MONOPRIX 1311')).getByLabelText('Sélectionner'));
    await user.click(within(row('CB MONOPRIX 1311')).getByLabelText('Sélectionner'));
    await user.selectOptions(within(bar()).getByRole('combobox'), 'env:env-courses');
    await user.click(within(bar()).getByRole('checkbox'));
    await user.click(within(bar()).getByRole('button', { name: 'Classer' }));
    await waitFor(() => expect(fake.called('POST', /bulk/)[0].body).toMatchObject({ ids: ['b-todo'], envelopeId: 'env-courses', remember: false }));
    expect(await screen.findByText('1 opération classée.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Tout'));
    await user.selectOptions(within(bar()).getByRole('combobox'), 'fix:fc-assurance');
    await user.click(within(bar()).getByRole('button', { name: 'Classer' }));
    await waitFor(() => expect(fake.called('POST', /bulk/)).toHaveLength(2));
    await user.click(screen.getByRole('button', { name: 'Toutes' }));
    await user.click(within(row('CB CINEMA')).getByLabelText('Sélectionner'));
    await user.click(within(bar()).getByRole('button', { name: /Ignorer/ }));
    expect(await screen.findByText('1 opération ignorée.')).toBeInTheDocument();
    await user.click(within(row('RETRAIT DAB PARIS')).getByLabelText('Sélectionner'));
    await user.selectOptions(within(bar()).getByRole('combobox'), 'cash');
    fake.db.bulkError = 'panne';
    await user.click(within(bar()).getByRole('button', { name: 'Classer' }));
    expect(await screen.findByText('panne')).toBeInTheDocument();
  });

  it('suggestions : accepter une à une ou toutes ; IA indisponible ; erreur', async () => {
    const { user, fake } = await renderPage(Bank);
    await loaded();
    await user.click(screen.getByRole('button', { name: /Suggérer un classement/ }));
    expect(await screen.findByText(/2 suggestions de classement/)).toBeInTheDocument();
    expect(screen.getByText('marchand connu')).toBeInTheDocument();
    expect(screen.getByText('IA')).toBeInTheDocument();
    await user.click(within(row('CB MONOPRIX 1311')).getByRole('button', { name: /Accepter$/ }));
    await waitFor(() => expect(fake.called('POST', /b-todo\/assign/)).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: /Accepter les 1 suggestion/ }));
    await waitFor(() => expect(fake.called('POST', /bulk/)[0].body).toMatchObject({ ids: ['b-prlv'], fixedChargeId: 'fc-assurance' }));
  });

  it('suggestions : IA indisponible puis serveur injoignable', async () => {
    const { user, fake } = await renderPage(Bank, { api: { suggestions: { suggestions: {}, aiError: 'Ollama 500' } } });
    await loaded();
    await user.click(screen.getByRole('button', { name: /Suggérer un classement/ }));
    expect(await screen.findByText(/IA indisponible/)).toBeInTheDocument();
    fake.db.down = true;
    await user.click(screen.getByRole('button', { name: /Suggérer un classement/ }));
    expect(await screen.findByText(/Serveur injoignable/)).toBeInTheDocument();
  });

  it('synchronisation, déconnexion, suppression de règle, import CSV, connexion d\'une banque', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValue(true);
    const { user, fake } = await renderPage(Bank);
    await loaded();
    await user.click(screen.getByRole('button', { name: /Synchroniser/ }));
    expect(await screen.findByText(/2 nouvelle\(s\) opération\(s\), 1 classée\(s\) automatiquement, 1 retrait/)).toBeInTheDocument();
    fake.db.syncError = 'Banque indisponible';
    await user.click(screen.getByRole('button', { name: /Synchroniser/ }));
    expect(await screen.findByText('Banque indisponible')).toBeInTheDocument();

    await user.click(screen.getAllByTitle('Déconnecter')[0]);
    expect(fake.called('DELETE', /connections/)).toHaveLength(0);
    await user.click(screen.getAllByTitle('Déconnecter')[0]);
    await waitFor(() => expect(fake.called('DELETE', /connections\/c1/)).toHaveLength(1));
    const rule = screen.getByText('LIDL').closest('div');
    await user.click(within(rule).getByRole('button'));
    await waitFor(() => expect(fake.called('DELETE', /rules\/r1/)).toHaveLength(1));

    // Import CSV (encodage Windows-1252 détecté)
    await user.click(screen.getByRole('button', { name: /CSV/ }));
    const file = new File([new Uint8Array([0x44, 0x61, 0x74, 0x65, 0xe9])], 'releve.csv', { type: 'text/csv' });
    file.arrayBuffer = async () => new Uint8Array([0x44, 0x61, 0x74, 0x65, 0xe9]).buffer;
    await user.upload(modal().querySelector('input[type=file]'), file);
    await user.clear(field('Compte'));
    await user.type(field('Compte'), 'Livret');
    await user.click(within(modal()).getByRole('button', { name: 'Importer' }));
    expect(await screen.findByText(/3 ligne\(s\) lue\(s\).*1 antérieure\(s\) au 1 octobre/)).toBeInTheDocument();
    expect(fake.called('POST', /import/)[0].body).toMatchObject({ accountName: 'Livret', csv: 'Dateé' });
    fake.db.importError = 'Colonnes attendues : Date, Libellé, Montant';
    await user.click(screen.getByRole('button', { name: /CSV/ }));
    const f2 = new File(['x'], 'a.csv');
    f2.arrayBuffer = async () => new TextEncoder().encode('x').buffer;
    await user.upload(modal().querySelector('input[type=file]'), f2);
    await user.click(within(modal()).getByRole('button', { name: 'Importer' }));
    expect(await within(modal()).findByText(/Colonnes attendues/)).toBeInTheDocument();
    await user.click(within(modal()).getByRole('button', { name: 'Annuler' }));

    // Connexion : recherche, erreur, choix d'une banque
    await user.click(screen.getByRole('button', { name: /^Connecter$/ }));
    expect(await within(modal()).findByText('Ma Banque')).toBeInTheDocument();
    await user.type(within(modal()).getByPlaceholderText(/Rechercher/), 'autre');
    expect(within(modal()).queryByText('Ma Banque')).not.toBeInTheDocument();
    fake.db.connectError = 'Consentement refusé';
    await user.click(within(modal()).getByText('Autre Banque'));
    expect(await within(modal()).findByText('Consentement refusé')).toBeInTheDocument();
    fake.db.connectError = null;
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, set href(v) { assign(v); } });
    await user.click(within(modal()).getByText('Autre Banque'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('about:blank#banque'));
    vi.unstubAllGlobals();
  });

  it('connecteur non configuré et aucune donnée ; liste des banques en erreur', async () => {
    await renderPage(Bank, { api: { bankStatus: { providerConfigured: false, connections: [], accounts: [], rules: [] }, bankTransactions: [] } });
    expect(await screen.findByText('Aucune opération bancaire')).toBeInTheDocument();
    expect(screen.getByText(/connecteur Enable Banking est configuré/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Connecter$/ })).not.toBeInTheDocument();
  });

  it('banques indisponibles ; statut injoignable', async () => {
    const { user, fake } = await renderPage(Bank, { api: { banksError: 'Enable Banking 500', bankTransactions: [] } });
    await user.click(await screen.findByRole('button', { name: /^Connecter$/ }));
    expect(await within(modal()).findByText('Enable Banking 500')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    fake.db.down = true;
    await user.click(screen.getByRole('button', { name: /CSV/ }));
    await user.click(within(modal()).getByRole('button', { name: 'Annuler' }));
  });
});
