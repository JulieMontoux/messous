import { test, expect } from '@playwright/test';
import { newAccount } from './helpers';

test('mobile : navigation du bas et menu « Plus »', async ({ page }) => {
  await newAccount(page);
  const nav = page.getByTestId('bottom-nav');
  await nav.getByRole('button', { name: 'Enveloppes' }).click();
  await expect(page.getByRole('heading', { name: 'Enveloppes' })).toBeVisible();
  await nav.getByRole('button', { name: 'Plus' }).click();
  await page.getByRole('button', { name: 'Avances' }).click();
  await expect(page.getByRole('heading', { name: 'Avances' })).toBeVisible();

  // Pas de défilement horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('mobile : le menu « Plus » est entièrement visible au-dessus de la barre du bas', async ({ page }) => {
  await newAccount(page);
  // Simule l'app installée sur iPhone : 34 px réservés à l'indicateur d'accueil
  await page.addStyleTag({ content: ':root { --sab: 34px !important; }' });
  const nav = page.getByTestId('bottom-nav');
  await nav.getByRole('button', { name: 'Plus' }).click();
  const menu = page.getByTestId('more-menu');
  await expect(menu).toBeVisible();

  const menuBox = await menu.boundingBox();
  const navBox = await nav.boundingBox();
  expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(navBox.y);
  expect(menuBox.y).toBeGreaterThanOrEqual(0);

  // Chaque bouton du menu est visible et n'est recouvert par rien
  for (const button of await menu.getByRole('button').all()) {
    const box = await button.boundingBox();
    const covered = await page.evaluate(([x, y, el]) => {
      const top = document.elementFromPoint(x, y);
      return !(el === top || el.contains(top));
    }, [box.x + box.width / 2, box.y + box.height / 2, await button.elementHandle()]);
    expect(covered).toBe(false);
  }
  await menu.getByRole('button', { name: 'Profil' }).click();
  await expect(menu).toBeHidden();
});
