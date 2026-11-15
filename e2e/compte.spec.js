import { test, expect } from '@playwright/test';
import { createRequire } from 'module';
import crypto from 'crypto';
import { newAccount, go, PASSWORD } from './helpers';

const require = createRequire(import.meta.url);
const { Client } = require('../api/node_modules/pg');
const DATABASE_URL = process.env.E2E_DATABASE_URL || 'postgres://messous@localhost:5432/messous';

// Le serveur de test n'a pas de SMTP : on crée directement le lien « mot de passe oublié »
// en base, exactement comme le ferait l'API (empreinte SHA-256, validité 1 heure)
async function resetLinkFor(email) {
  const token = crypto.randomBytes(32).toString('base64url');
  const db = new Client({ connectionString: DATABASE_URL });
  await db.connect();
  try {
    await db.query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) SELECT id, $2, NOW() + INTERVAL '1 hour' FROM users WHERE email = $1",
      [email, crypto.createHash('sha256').update(token).digest('hex')]
    );
  } finally {
    await db.end();
  }
  return `/#reset=${token}`;
}

async function login(page, email, password) {
  await page.getByPlaceholder('julie@exemple.fr').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('compte : changer de mot de passe, mot de passe oublié, suppression du compte', async ({ page }) => {
  const email = await newAccount(page);

  // 1. Changement depuis le profil
  await go(page, 'settings');
  await page.getByRole('button', { name: 'Changer de mot de passe' }).click();
  await page.getByLabel('Mot de passe actuel').fill(PASSWORD);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('deuxieme-mdp');
  await page.getByLabel('Confirmer le nouveau mot de passe').fill('deuxieme-mdp');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('✓ Mot de passe modifié')).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await login(page, email, PASSWORD);
  await expect(page.getByText('Email ou mot de passe incorrect')).toBeVisible();

  // 2. Mot de passe oublié : demande, puis lien reçu
  await page.getByRole('button', { name: 'Mot de passe oublié ?' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Recevoir le lien' }).click();
  await expect(page.getByText(/Si un compte existe pour/)).toBeVisible();

  await page.goto(await resetLinkFor(email));
  await expect(page).not.toHaveURL(/#reset=/);
  await page.getByLabel('Nouveau mot de passe').fill('troisieme-mdp');
  await page.getByLabel('Confirmer').fill('troisieme-mdp');
  await page.getByRole('button', { name: 'Changer le mot de passe' }).click();
  await expect(page.getByRole('heading', { name: /\d{4}/ })).toBeVisible();

  // 3. Suppression du compte
  await go(page, 'settings');
  await page.getByRole('button', { name: 'Supprimer mon compte' }).click();
  await page.getByLabel('Ton mot de passe').fill('troisieme-mdp');
  await page.getByLabel('Tape SUPPRIMER pour confirmer').fill('SUPPRIMER');
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
  await login(page, email, 'troisieme-mdp');
  await expect(page.getByText('Email ou mot de passe incorrect')).toBeVisible();
});
