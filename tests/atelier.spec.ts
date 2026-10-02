import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { distUrl } from './util';

/* Étape 6 : atelier de création, « Mes créations », réutilisation — en file://. */

const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);

async function openSample(page: Page) {
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  await page.locator('[data-tool="mobilier"]').click();
}
async function setField(page: Page, label: string, v: number) {
  const f = page.getByTestId('atelier-panel').getByLabel(label, { exact: true });
  await f.fill(String(v)); await f.press('Enter');
}
/** Construit une table de 140 × 70 × 76 cm : un plateau et quatre pieds. */
async function buildTable(page: Page, name = 'Table de dégustation') {
  await page.getByTestId('library').getByRole('button', { name: 'Créer un meuble' }).click();
  await expect(page.getByTestId('atelier')).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter : Plan' }).click();
  await setField(page, 'Longueur', 140); await setField(page, 'Largeur', 70); await setField(page, 'Épaisseur', 4); await setField(page, 'Z (hauteur)', 72);
  await page.getByTestId('atelier-panel').getByRole('button', { name: 'Chêne' }).click();
  for (const [x, y] of [[5, 5], [130, 5], [5, 60], [130, 60]]) {
    await page.getByRole('button', { name: 'Ajouter : Cylindre' }).click();
    await setField(page, 'Diamètre', 5); await setField(page, 'Hauteur', 72);
    await setField(page, 'X', x); await setField(page, 'Y', y); await setField(page, 'Z (hauteur)', 0);
    await page.getByTestId('atelier-panel').getByRole('button', { name: 'Noir' }).click();
  }
  await page.locator('.at-name-in').fill(name); await page.locator('.at-name-in').press('Enter');
  await page.getByLabel('Catégorie du meuble').selectOption('tables');
  await expect(page.locator('.at-total')).toHaveText('Total : 140 × 70 × 76 cm');
}

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('index.html'));
});
test.afterEach(() => expect(errors).toEqual([]));

test('créer un meuble par assemblage, l’ajouter à Mes créations et le placer', async ({ page }) => {
  await openSample(page);
  await buildTable(page);
  // Annuler / rétablir dans l'atelier
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Ajouter : Boîte' }).click();
  await expect(page.getByTestId('volumes')).toContainText('Boîte 1');
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('volumes')).not.toContainText('Boîte 1');
  // Déplacer un volume au clavier (1 cm par appui)
  await page.locator('.at-row', { hasText: 'Cylindre 1' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('atelier-panel').getByLabel('X', { exact: true })).toHaveValue('6');
  await page.keyboard.press('Control+z');

  await page.getByRole('button', { name: 'Ajouter à Mes créations' }).click();
  // Retour à la boutique, bibliothèque ouverte sur « Mes créations »
  const lib = page.getByTestId('library');
  await expect(lib.locator('.lib-tab.on')).toContainText('Mes créations');
  const card = lib.locator('.fc', { hasText: 'Table de dégustation' });
  await expect(card.locator('.fc-d')).toHaveText('140 × 70 × 76 cm');
  await expect(card.locator('img')).toHaveAttribute('src', /^data:image\/png/, { timeout: 15_000 });
  await card.dblclick();
  const d = await doc(page);
  expect(d.creations).toHaveLength(1);
  expect(d.creations[0]).toMatchObject({ name: 'Table de dégustation', cat: 'tables' });
  expect(d.creations[0].volumes).toHaveLength(5);
  expect(d.objects).toHaveLength(1);
  expect(d.objects[0].model).toBe(d.creations[0].id);
  expect(d.objects[0].size.w).toBeCloseTo(1.4, 3);
  expect(d.objects[0].size.h).toBeCloseTo(0.76, 3);
  await expect(page.getByTestId('panel')).toContainText('Tables · Mes créations');
});

test('modifier une création met à jour les meubles déjà posés', async ({ page }) => {
  await openSample(page);
  await buildTable(page);
  await page.getByRole('button', { name: 'Ajouter à Mes créations' }).click();
  await page.locator('.fc', { hasText: 'Table de dégustation' }).dblclick();
  // Rouvrir dans l'atelier depuis la carte
  await page.locator('[data-tool="mobilier"]').click();
  const card = page.locator('.fc', { hasText: 'Table de dégustation' });
  await card.hover();
  await card.getByTitle('Modifier dans l’atelier').click();
  await page.locator('.at-row', { hasText: 'Plan 1' }).click();
  await setField(page, 'Longueur', 180);
  await page.getByRole('button', { name: 'Enregistrer le meuble' }).click();
  await expect(page.getByText('mis à jour')).toBeVisible();
  const d = await doc(page);
  expect(d.creations).toHaveLength(1);
  expect(d.objects[0].size.w).toBeCloseTo(1.8, 3);
});

test('une création est réutilisable dans un autre projet du même poste, et enregistrée dans le fichier', async ({ page }, info) => {
  await page.addInitScript(() => { delete (window as any).showSaveFilePicker; delete (window as any).showOpenFilePicker; });
  await page.goto(distUrl('index.html'));
  await openSample(page);
  await buildTable(page, 'Présentoir');
  await page.getByRole('button', { name: 'Ajouter à Mes créations' }).click();
  await expect(page.locator('.fc', { hasText: 'Présentoir' })).toBeVisible();
  await page.waitForTimeout(300);
  // Nouveau projet : la création du poste est proposée
  await page.locator('.tb-logo').click();
  await page.getByRole('button', { name: 'Quitter sans enregistrer' }).click();
  await page.getByTestId('new-project').click();
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await page.getByRole('button', { name: 'Créer ce rectangle' }).click();
  await page.locator('[data-tool="mobilier"]').click();
  await page.locator('.lib-tab', { hasText: 'Mes créations' }).click();
  const card = page.locator('.fc', { hasText: 'Présentoir' });
  await expect(card.locator('.fc-badge')).toHaveText('Poste');
  await card.dblclick();
  const d = await doc(page);
  expect(d.creations.map((c: any) => c.name)).toEqual(['Présentoir']);
  // Le fichier enregistré contient la création
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const file = info.outputPath('p.json'); await (await dl).saveAs(file);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  expect(json.creations).toHaveLength(1);
  expect(json.creations[0].volumes).toHaveLength(5);
});

test('supprimer une création retire aussi les meubles posés (avec confirmation)', async ({ page }) => {
  await openSample(page);
  await buildTable(page, 'À jeter');
  await page.getByRole('button', { name: 'Ajouter à Mes créations' }).click();
  await page.locator('.fc', { hasText: 'À jeter' }).dblclick();
  await page.locator('[data-tool="mobilier"]').click();
  const card = page.locator('.fc', { hasText: 'À jeter' });
  await card.hover();
  await card.getByTitle('Supprimer').click();
  await expect(page.getByRole('dialog')).toContainText('posé 1 fois');
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  const d = await doc(page);
  expect(d.creations).toHaveLength(0);
  expect(d.objects).toHaveLength(0);
});
