import { test, expect } from '@playwright/test';
import { distUrl } from './util';

test('la page de diagnostic fonctionne en file:// et produit un rapport', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('diagnostic.html'));
  await expect(page.getByRole('heading', { name: 'Test du poste' })).toBeVisible();
  await expect(page.getByText('Double-clic sur le fichier (file://)')).toBeVisible();
  await expect(page.getByText('Nunito chargée')).toBeVisible();
  // Le test de performance dure ~12 s.
  await expect(page.getByRole('button', { name: 'Télécharger le rapport' })).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('.dg-phase .fps').first()).toHaveText(/\d+ im\/s/);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le rapport' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('rapport-test-poste.txt');
  expect(errors).toEqual([]);
});
