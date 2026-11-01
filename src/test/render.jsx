// Rendu d'une page avec le vrai BudgetProvider branché sur le faux serveur
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { BudgetProvider, useBudget } from '../context/BudgetContext';
import { AuthProvider } from '../context/AuthContext';
import { installFakeApi } from './fakeApi';
import { TODAY } from './fixtures';

// Date figée (seul Date est simulé : les minuteries restent réelles pour Testing Library)
export function freezeDate(iso = `${TODAY}T12:00:00`) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

// Comme l'application : la page n'est affichée qu'une fois les données chargées
function Gate({ children }) {
  const { ready } = useBudget();
  return ready ? <><span data-testid="budget-ready" hidden />{children}</> : null;
}

export async function renderPage(Page, { api, params = {}, wait = true, date } = {}) {
  freezeDate(date);
  const fake = installFakeApi(api);
  localStorage.setItem('messous_token', 'jeton');
  const navigate = vi.fn();
  const user = userEvent.setup();
  const utils = render(
    <AuthProvider>
      <BudgetProvider>
        <Gate><Page navigate={navigate} params={params} /></Gate>
      </BudgetProvider>
    </AuthProvider>
  );
  if (wait) await screen.findByTestId('budget-ready', {}, { timeout: 3000 });
  return { ...utils, fake, navigate, user };
}

// Laisse les requêtes en attente se terminer (synchronisation en arrière-plan)
export const flush = () => new Promise(r => setTimeout(r, 0));

// Champ de formulaire trouvé par le texte de son libellé (<label> suivi du champ)
export function field(labelText, root = document.body) {
  const labels = [...root.querySelectorAll('label')].filter(l =>
    (labelText instanceof RegExp ? labelText.test(l.textContent) : l.textContent.trim() === labelText));
  if (!labels.length) throw new Error(`Libellé introuvable : ${labelText}`);
  const label = labels.at(-1);
  const el = label.querySelector('input,select,textarea') || label.parentElement.querySelector('input,select,textarea');
  if (!el) throw new Error(`Champ introuvable pour : ${labelText}`);
  return el;
}

// Fenêtre modale ouverte (la dernière)
export function modal() {
  const all = document.querySelectorAll('.fixed.inset-0.z-50 .relative');
  if (!all.length) throw new Error('Aucune fenêtre ouverte');
  return all[all.length - 1];
}
