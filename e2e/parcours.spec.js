import { test, expect } from '@playwright/test';
import { newAccount, register, go, bankCsv, frDate, PASSWORD, uniqueEmail } from './helpers';

test('inscription, démarrage puis reconnexion', async ({ page }) => {
  const email = await newAccount(page, { firstName: 'Camille' });
  await expect(page.getByRole('main').getByText('Camille')).toBeVisible();

  // Déconnexion puis connexion : on retrouve son budget (pas l'écran de démarrage)
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByText('Connexion à ton compte')).toBeVisible();
  await page.getByPlaceholder('julie@exemple.fr').fill(email);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('main').getByText('Camille')).toBeVisible();
});

test('mauvais mot de passe : message clair, pas de connexion', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('julie@exemple.fr').fill(uniqueEmail('inconnu'));
  await page.getByPlaceholder('••••••••').fill('mauvais');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByText('Email ou mot de passe incorrect')).toBeVisible();
});

test('dépense dans une enveloppe, puis retrait enregistré', async ({ page }) => {
  await newAccount(page);
  await go(page, 'envelopes');
  const courses = page.locator('.card', { has: page.getByText('Courses', { exact: true }) }).first();
  await courses.getByTitle('Ajouter une dépense').click();
  await page.getByPlaceholder('0.00').fill('42');
  await page.getByPlaceholder('Ex. Carrefour, Total, …').fill('Marché');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(courses.getByText(/42\s€\s+\/\s+280/)).toBeVisible();

  // Retrait : le montant conseillé est proposé, puis enregistré
  await page.getByRole('button', { name: 'Retrait' }).click();
  const confirm = page.getByRole('button', { name: /J'ai retiré/ });
  await expect(confirm).toBeVisible();
  await page.getByPlaceholder(/^\d+$/).fill('60');
  await page.getByRole('button', { name: /J'ai retiré 60/ }).click();
  await expect(page.getByText('Retraits réels')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'Retraits réels' }).getByText(/60\s€/).first()).toBeVisible();

  // Les données sont bien enregistrées côté serveur : elles survivent à un rechargement
  await page.reload();
  await expect(page.locator('.card', { has: page.getByText('Courses', { exact: true }) }).first().getByText(/42\s€\s+\/\s+280/)).toBeVisible();
});

test('banque : import CSV, suggestions, classement en masse, retrait DAB détecté', async ({ page }) => {
  await newAccount(page);
  await go(page, 'bank');
  await page.getByRole('button', { name: 'CSV' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'releve.csv',
    mimeType: 'text/csv',
    buffer: bankCsv([
      `${frDate(0)};CB MONOPRIX 0211;-23,10`,
      `${frDate(0)};CB LIDL 0211;-12,40`,
      `${frDate(0)};CB CHEZ MARCEL;-30,00`,
      `${frDate(0)};RETRAIT DAB PARIS;-40,00`,
      `${frDate(0)};VIR SALAIRE;2500,00`,
    ]),
  });
  await page.getByRole('button', { name: 'Importer' }).click();
  await expect(page.getByText(/5 ligne\(s\) lue\(s\).*1 retrait\(s\) d'espèces/)).toBeVisible();
  await expect(page.getByRole('button', { name: /À classer \(3\)/ })).toBeVisible();

  // Suggestions : Monoprix et Lidl reconnus (marchands connus) → Courses
  await page.getByRole('button', { name: 'Suggérer un classement' }).click();
  await page.getByRole('button', { name: 'Accepter les 2 suggestions' }).click();
  await expect(page.getByText('2 opérations classées.')).toBeVisible();
  await expect(page.getByRole('button', { name: /À classer \(1\)/ })).toBeVisible();

  // Classement en masse du dernier paiement
  await page.getByLabel('Tout').check();
  const bar = page.locator('.bg-slate-800');
  await bar.locator('select').selectOption({ label: '🍽️ Restaurants / Livraisons' });
  await bar.getByRole('button', { name: 'Classer', exact: true }).click();
  await expect(page.getByText('Tout est classé 🎉')).toBeVisible();

  // Le retrait DAB apparaît dans les retraits réels de la page Enveloppes
  await go(page, 'envelopes');
  await expect(page.locator('.card', { hasText: 'Retraits réels' }).getByText(/40\s€/).first()).toBeVisible();
});

test('clôture du mois avec report d\'un reste d\'enveloppe', async ({ page }) => {
  await newAccount(page);
  await go(page, 'history');
  await page.getByRole('button', { name: 'Clôturer le mois' }).click();
  // Reporter le reste de l'enveloppe Courses (créée par le démarrage)
  await page.locator('label', { hasText: 'Courses' }).locator('input[type=checkbox]').check();
  await expect(page.getByText(/reportés sur/)).toBeVisible();
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByText('clôturé').first()).toBeVisible();
});

test('profil : mode sombre et export CSV', async ({ page }) => {
  await newAccount(page);
  await go(page, 'settings');
  await page.getByRole('button', { name: 'Sombre' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('main').getByRole('button', { name: 'Charges fixes' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^messous-charges-.*\.csv$/);
});

test('réinitialisation : retour à l\'écran de démarrage, compte conservé', async ({ page }) => {
  await newAccount(page);
  await go(page, 'settings');
  await page.getByRole('button', { name: 'Réinitialiser toutes les données' }).click();
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.getByPlaceholder('SUPPRIMER').fill('SUPPRIMER');
  await page.getByRole('button', { name: 'Tout supprimer' }).click();
  await expect(page.getByText('Bienvenue')).toBeVisible();
});

test('API indisponible : écran d\'erreur, jamais l\'écran de démarrage', async ({ page }) => {
  await register(page);
  await page.route('**/api/profile', route => route.fulfill({ status: 502, body: 'Bad Gateway' }));
  await page.reload();
  await expect(page.getByText('Impossible de charger tes données')).toBeVisible();
  await expect(page.getByText('Bienvenue')).toHaveCount(0);
});
