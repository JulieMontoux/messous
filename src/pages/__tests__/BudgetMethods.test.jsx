import { describe, it, expect } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import Settings from '../Settings';
import Dashboard from '../Dashboard';
import { renderPage, field } from '../../test/render';

const lastPut = (fake, re) => fake.called('PUT', re).at(-1)?.body;

describe('Méthodes de budget (profil)', () => {
  it('choix de la méthode, objectif Kakeibo, calcul sans charges fixes', async () => {
    const { user, fake } = await renderPage(Settings);
    // 50/30/20 par défaut : la répartition personnalisée est proposée
    expect(screen.getByText('Répartition 50/30/20 personnalisée')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Kakeibo/ }));
    await waitFor(() => expect(lastPut(fake, /\/api\/settings$/)).toEqual({ budgetRule: 'kakeibo' }));
    expect(screen.queryByText('Répartition 50/30/20 personnalisée')).not.toBeInTheDocument();

    const goal = field(/Objectif d'épargne Kakeibo/);
    expect(screen.getByText(/Sans montant, l'objectif est de/)).toBeInTheDocument();
    await user.type(goal, '300');
    fireEvent.blur(goal);
    await waitFor(() => expect(lastPut(fake, /\/api\/profile$/)).toMatchObject({ kakeiboSavingsGoal: 300 }));

    await user.click(screen.getByText(/Compter les charges fixes/).closest('div').parentElement.querySelector('button'));
    await waitFor(() => expect(lastPut(fake, /\/api\/profile$/)).toMatchObject({ budgetIncludeFixed: false }));
    expect(screen.getByText('Calcul sur le salaire moins les charges fixes')).toBeInTheDocument();
  });

  it('répartition personnalisée affichée sur la carte 50/30/20', async () => {
    await renderPage(Settings, { api: { profile: { idealNeedsPct: 60, idealWantsPct: 20, idealSavingsPct: 20 } } });
    expect(screen.getByText(/Personnalisée : 60 % besoins · 20 % envies · 20 % épargne/)).toBeInTheDocument();
  });

  it('avis de l\'IA : méthode conseillée, raisons, application', async () => {
    const { user, fake } = await renderPage(Settings);
    await user.click(screen.getByRole('button', { name: /Demander l'avis de l'IA/ }));
    expect(await screen.findByText(/6 jarres, sans les charges fixes/)).toBeInTheDocument();
    expect(screen.getByText(/D'après 3 mois de dépenses \(oct\. 2026, sept\. 2026, août 2026\)/)).toBeInTheDocument();
    expect(screen.getByText(/Tes envies restent modérées/)).toBeInTheDocument();
    expect(screen.getByText(/Crée une enveloppe Formation/)).toBeInTheDocument();
    // la comparaison envoyée porte sur les mois complets de l'historique
    const sent = fake.called('POST', /budget-method/)[0].body;
    expect(sent.comparison.months).toEqual(['2026-10', '2026-09', '2026-08']);
    expect(sent.comparison.rules.map(r => r.id)).toContain('kakeibo');
    await user.click(screen.getByRole('button', { name: 'Appliquer cette méthode' }));
    await waitFor(() => expect(lastPut(fake, /\/api\/settings$/)).toEqual({ budgetRule: 'six-jars' }));
    await waitFor(() => expect(lastPut(fake, /\/api\/profile$/)).toMatchObject({ budgetIncludeFixed: false }));
    expect(screen.getByText(/C'est ta méthode actuelle/)).toBeInTheDocument();
  });

  it('avis de l\'IA : repli sur les chiffres, erreur, pas d\'historique', async () => {
    const fallback = { ruleId: '50-30-20', includeFixed: true, reasons: ['Proche.'], tip: '', fallback: true, months: ['2026-10'] };
    const { user, fake } = await renderPage(Settings, { api: { aiMethod: fallback } });
    await user.click(screen.getByRole('button', { name: /Demander l'avis de l'IA/ }));
    expect(await screen.findByText(/méthode choisie d'après les chiffres seuls/)).toBeInTheDocument();
    expect(screen.getByText(/D'après 1 mois/)).toBeInTheDocument();
    expect(screen.getByText(/C'est ta méthode actuelle/)).toBeInTheDocument();

    fake.db.aiMethodError = 'Ollama 500';
    await user.click(screen.getByRole('button', { name: /Demander l'avis de l'IA/ }));
    expect(await screen.findByText(/L'IA n'a pas répondu \(Ollama 500\)/)).toBeInTheDocument();
    expect(fake.called('POST', /budget-method/)).toHaveLength(2); // pas de nouvel essai automatique
  });

  it('avis de l\'IA : sans mois complet de dépenses, pas d\'appel', async () => {
    const { user, fake } = await renderPage(Settings, { api: { transactions: [] } });
    await user.click(screen.getByRole('button', { name: /Demander l'avis de l'IA/ }));
    expect(screen.getByText(/Pas encore assez d'historique/)).toBeInTheDocument();
    expect(fake.called('POST', /budget-method/)).toHaveLength(0);
  });
});

describe('Méthodes de budget (tableau de bord)', () => {
  it('base zéro : reste à affecter ; Kakeibo : objectif et lien vers le bilan', async () => {
    const { user, fake, navigate } = await renderPage(Dashboard);
    const select = screen.getByRole('combobox', { name: 'Méthode de budget' });
    await user.selectOptions(select, 'zero-based');
    expect(screen.getByText('Reste à affecter')).toBeInTheDocument();
    await waitFor(() => expect(lastPut(fake, /\/api\/settings$/)).toEqual({ budgetRule: 'zero-based' }));
    await user.selectOptions(select, 'kakeibo');
    expect(screen.getByText("Objectif d'épargne")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Faire le bilan du mois/ }));
    expect(navigate).toHaveBeenCalledWith('history');
    await user.selectOptions(select, 'six-jars');
    expect(screen.getByText('Liberté financière')).toBeInTheDocument();
  });
});
