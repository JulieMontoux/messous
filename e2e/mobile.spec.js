import { test, expect } from '@playwright/test';
import { newAccount } from './helpers';

test('mobile : navigation du bas et menu « Plus »', async ({ page }) => {
  await newAccount(page);
  const nav = page.locator('nav.fixed.bottom-0');
  await nav.getByRole('button', { name: 'Enveloppes' }).click();
  await expect(page.getByRole('heading', { name: 'Enveloppes' })).toBeVisible();
  await nav.getByRole('button', { name: 'Plus' }).click();
  await page.getByRole('button', { name: 'Avances' }).click();
  await expect(page.getByRole('heading', { name: 'Avances' })).toBeVisible();

  // Pas de défilement horizontal
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
