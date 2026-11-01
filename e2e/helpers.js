import { expect } from '@playwright/test';

export const PASSWORD = 'motdepasse1';

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@exemple.fr`;
}

// Inscription par l'écran « S'inscrire »
export async function register(page, email = uniqueEmail()) {
  await page.goto('/');
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await page.getByPlaceholder('julie@exemple.fr').fill(email);
  await page.getByPlaceholder('Min. 6 caractères').fill(PASSWORD);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.locator('form button[type=submit]').click();
  await expect(page.getByText('Bienvenue')).toBeVisible();
  return email;
}

// Parcours de démarrage complet (5 étapes) avec les valeurs proposées
export async function onboard(page, { firstName = 'Julie', salary = '2500', smoker = false } = {}) {
  await page.getByPlaceholder('Ex. Julie').fill(firstName);
  await page.getByPlaceholder('Ex. 2200').fill(salary);
  await page.getByRole('button', { name: 'Continuer' }).click(); // → foyer
  await page.getByRole('button', { name: 'Continuer' }).click(); // → profil
  if (smoker) await page.getByText('Je fume').click();
  await page.getByRole('button', { name: 'Continuer' }).click(); // → charges
  await page.getByRole('button', { name: 'Continuer' }).click(); // → enveloppes
  await page.getByRole('button', { name: "C'est parti !" }).click();
  await expect(page.getByRole('heading', { name: 'Mon budget' })).toBeVisible();
}

export async function newAccount(page, opts) {
  const email = await register(page);
  await onboard(page, opts);
  return email;
}

// Navigation par l'URL (même mécanisme que les liens des e-mails)
export async function go(page, name) {
  await page.goto(`/?page=${name}`);
}

// Fichier CSV de relevé bancaire, daté autour d'aujourd'hui
export function bankCsv(lines) {
  return Buffer.from(['Date;Libellé;Montant', ...lines].join('\n'), 'utf8');
}

export function frDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
