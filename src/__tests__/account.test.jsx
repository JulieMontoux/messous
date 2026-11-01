import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import AccountCard from '../components/AccountCard';
import Settings from '../pages/Settings';
import { readResetToken } from '../pages/PasswordReset';
import { installFakeApi } from '../test/fakeApi';
import { freezeDate, renderPage } from '../test/render';

function renderApp(api, { token = null, url = '/' } = {}) {
  freezeDate();
  const fake = installFakeApi(api);
  if (token) localStorage.setItem('messous_token', token);
  window.history.replaceState(null, '', url);
  const user = userEvent.setup();
  render(<AuthProvider><App /></AuthProvider>);
  return { fake, user };
}

function renderCard(email = 'julie@exemple.fr') {
  const fake = installFakeApi();
  localStorage.setItem('messous_token', 'jeton');
  const user = userEvent.setup();
  render(<AuthProvider><AccountCard email={email} /></AuthProvider>);
  return { fake, user };
}

describe('mot de passe oublié', () => {
  it('depuis la connexion : demande du lien, message de confirmation, retour', async () => {
    const { fake, user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    await user.type(screen.getByLabelText('Email'), 'julie@exemple.fr');
    await user.click(screen.getByRole('button', { name: 'Recevoir le lien' }));
    expect(await screen.findByText(/Si un compte existe pour/)).toBeInTheDocument();
    expect(screen.getByText('julie@exemple.fr')).toBeInTheDocument();
    expect(fake.called('POST', /\/api\/auth\/forgot$/)[0].body).toEqual({ email: 'julie@exemple.fr' });
    await user.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });

  it('erreur (trop de demandes) affichée, retour possible sans envoyer', async () => {
    const { user } = renderApp({ forgotError: 'Trop de tentatives. Réessaie dans 60 min.' });
    await user.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    await user.type(screen.getByLabelText('Email'), 'julie@exemple.fr');
    await user.click(screen.getByRole('button', { name: 'Recevoir le lien' }));
    expect(await screen.findByText(/Trop de tentatives/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retour à la connexion' }));
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });
});

describe('lien de réinitialisation', () => {
  it('jeton lu dans l\'adresse puis retiré ; rien sans lien', () => {
    window.history.replaceState(null, '', '/?page=bank#reset=abc-DEF_123');
    expect(readResetToken()).toBe('abc-DEF_123');
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?page=bank');
    expect(readResetToken()).toBeNull();
    window.history.replaceState(null, '', '/#autre=1');
    expect(readResetToken()).toBeNull();
  });

  it('nouveau mot de passe : contrôles, puis connexion directe à l\'application', async () => {
    const { fake, user } = renderApp({}, { url: '/#reset=bon-jeton' });
    expect(window.location.hash).toBe('');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), '123');
    await user.type(screen.getByLabelText('Confirmer'), '123');
    await user.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    expect(screen.getByText('Au moins 6 caractères')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Nouveau mot de passe'));
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveau-mdp');
    await user.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    expect(screen.getByText('Les mots de passe ne correspondent pas')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Confirmer'));
    await user.type(screen.getByLabelText('Confirmer'), 'nouveau-mdp');
    await user.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    await waitFor(() => expect(localStorage.getItem('messous_token')).toBe('jeton-reset'));
    expect(fake.called('POST', /\/api\/auth\/reset$/)[0].body).toEqual({ token: 'bon-jeton', password: 'nouveau-mdp' });
    expect(await screen.findByText('Bonjour Julie 👋')).toBeInTheDocument();
  });

  it('lien expiré : message clair ; annuler ramène à la connexion', async () => {
    const { user } = renderApp({}, { url: '/#reset=jeton-expire' });
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveau-mdp');
    await user.type(screen.getByLabelText('Confirmer'), 'nouveau-mdp');
    await user.click(screen.getByRole('button', { name: 'Changer le mot de passe' }));
    expect(await screen.findByText(/Lien invalide ou expiré/)).toBeInTheDocument();
    expect(localStorage.getItem('messous_token')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.getByRole('button', { name: 'Se connecter' })).toBeInTheDocument();
  });
});

describe('compte (profil)', () => {
  it('changer de mot de passe : contrôles, erreur serveur, succès avec nouveau jeton', async () => {
    const { fake, user } = renderCard();
    expect(screen.getByText('julie@exemple.fr')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Changer de mot de passe/ }));
    const save = () => user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();

    await user.type(screen.getByLabelText('Mot de passe actuel'), 'faux');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), '123');
    await save();
    expect(screen.getByText(/au moins 6 caractères/)).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Nouveau mot de passe'));
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'nouveau-mdp');
    await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'autre-mdp');
    await save();
    expect(screen.getByText('Les nouveaux mots de passe ne correspondent pas')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Confirmer le nouveau mot de passe'));
    await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'nouveau-mdp');
    await save();
    expect(await screen.findByText('Mot de passe actuel incorrect')).toBeInTheDocument();
    expect(localStorage.getItem('messous_token')).toBe('jeton');

    await user.clear(screen.getByLabelText('Mot de passe actuel'));
    await user.type(screen.getByLabelText('Mot de passe actuel'), 'motdepasse1');
    await save();
    expect(await screen.findByText('✓ Mot de passe modifié')).toBeInTheDocument();
    expect(localStorage.getItem('messous_token')).toBe('jeton-nouveau');
    expect(fake.called('PUT', /\/api\/auth\/password$/).at(-1).body).toEqual({ currentPassword: 'motdepasse1', newPassword: 'nouveau-mdp' });
    expect(screen.queryByLabelText('Mot de passe actuel')).not.toBeInTheDocument();

    // Rouvrir puis annuler : le message de succès disparaît
    await user.click(screen.getByRole('button', { name: /Changer de mot de passe/ }));
    expect(screen.queryByText('✓ Mot de passe modifié')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByLabelText('Mot de passe actuel')).not.toBeInTheDocument();
  });

  it('supprimer son compte : confirmation exigée, mauvais mot de passe, puis déconnexion', async () => {
    const { fake, user } = renderCard();
    await user.click(screen.getByRole('button', { name: /Supprimer mon compte/ }));
    expect(screen.getByText(/irréversible/)).toBeInTheDocument();
    const confirmBtn = () => screen.getByRole('button', { name: 'Supprimer définitivement' });
    expect(confirmBtn()).toBeDisabled();

    await user.type(screen.getByLabelText('Ton mot de passe'), 'faux');
    expect(confirmBtn()).toBeDisabled();
    await user.type(screen.getByLabelText('Tape SUPPRIMER pour confirmer'), 'supprimer');
    expect(confirmBtn()).toBeEnabled();
    await user.click(confirmBtn());
    expect(await screen.findByText('Mot de passe incorrect')).toBeInTheDocument();
    expect(localStorage.getItem('messous_token')).toBe('jeton');

    await user.clear(screen.getByLabelText('Ton mot de passe'));
    await user.type(screen.getByLabelText('Ton mot de passe'), 'motdepasse1');
    await user.click(confirmBtn());
    await waitFor(() => expect(localStorage.getItem('messous_token')).toBeNull());
    expect(fake.called('DELETE', /\/api\/auth\/account$/).at(-1).body).toEqual({ password: 'motdepasse1' });
  });

  it('suppression annulée ; carte sans adresse connue', async () => {
    const { user } = renderCard('');
    expect(screen.queryByText(/Adresse du compte/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Supprimer mon compte/ }));
    expect(screen.queryByText(/\(julie/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(screen.queryByText(/irréversible/)).not.toBeInTheDocument();
  });

  it('page Profil : carte Compte avec l\'adresse du compte', async () => {
    await renderPage(Settings);
    expect(screen.getByText('Compte')).toBeInTheDocument();
    expect(screen.getByText(/Adresse du compte/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Supprimer mon compte/ })).toBeInTheDocument();
  });
});
