import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { distUrl, nouveauProjet } from './util';

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
  await page.getByRole('button', { name: 'Ajouter : Boîte', exact: true }).click();
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
  await nouveauProjet(page);
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

test('placer un volume par rapport à un autre, et les nouvelles formes', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('library').getByRole('button', { name: 'Créer un meuble' }).click();
  const panel = page.getByTestId('atelier-panel');
  // Un socle de 80 × 80 × 10 cm, puis une colonne (tube) de Ø40 × 70 cm
  await page.getByRole('button', { name: 'Ajouter : Boîte', exact: true }).click();
  await setField(page, 'Longueur', 80); await setField(page, 'Profondeur', 80); await setField(page, 'Hauteur', 10);
  await page.getByRole('button', { name: 'Ajouter : Tube' }).click();
  await setField(page, 'Diamètre', 40); await setField(page, 'Hauteur', 70);
  // La référence par défaut est le volume choisi juste avant : le socle
  const ref = panel.getByLabel('Volume de référence', { exact: true });
  expect(await ref.evaluate((s: HTMLSelectElement) => s.selectedOptions[0].textContent)).toBe('Boîte 1');
  await panel.getByRole('button', { name: 'Centrer sur le volume de référence (vu de dessus)' }).click();
  await panel.getByRole('button', { name: 'Poser sur le dessus du volume de référence' }).click();
  await expect(panel.getByLabel('X', { exact: true })).toHaveValue('20');
  await expect(panel.getByLabel('Y', { exact: true })).toHaveValue('20');
  await expect(panel.getByLabel('Z (hauteur)', { exact: true })).toHaveValue('10');
  // Coller à droite du socle, puis remettre au sol
  await panel.getByRole('button', { name: 'Coller sur le côté droit de la référence' }).click();
  await expect(panel.getByLabel('X', { exact: true })).toHaveValue('80');
  await panel.getByRole('button', { name: 'Poser au sol (hauteur 0)' }).click();
  await expect(panel.getByLabel('Z (hauteur)', { exact: true })).toHaveValue('0');
  await expect(page.locator('.at-total')).toHaveText('Total : 120 × 80 × 70 cm');
  // Les nouvelles formes
  for (const s of ['Boule', 'Cône', 'Demi-rond', 'Demi-boule', 'Boîte arrondie', 'Pyramide', 'Prisme']) await page.getByRole('button', { name: 'Ajouter : ' + s, exact: true }).click();
  await setField(page, 'Hauteur', 50); // prisme sélectionné
  await panel.getByRole('button', { name: 'En coin (triangle droit)' }).click();
  const types = await page.evaluate(() => {
    const vols = Array.from(document.querySelectorAll('.at-row .at-name')).map(e => e.textContent);
    return vols;
  });
  expect(types).toEqual(['Boîte 1', 'Tube 1', 'Boule 1', 'Cône 1', 'Demi-rond 1', 'Demi-boule 1', 'Boîte arrondie 1', 'Pyramide 1', 'Prisme 1']);
  await page.getByRole('button', { name: 'Ajouter à Mes créations' }).click();
  const d = await doc(page);
  expect(d.creations[0].volumes.map((v: any) => v.type)).toEqual(['boite', 'tube', 'boule', 'cone', 'demirond', 'demiboule', 'arrondie', 'pyramide', 'prisme']);
  expect(d.creations[0].volumes[8].turned).toBe(true);
});

test('tourner et pencher un volume à n’importe quel angle ; angle exact d’un meuble', async ({ page }) => {
  await openSample(page);
  await page.getByTestId('library').getByRole('button', { name: 'Créer un meuble' }).click();
  const panel = page.getByTestId('atelier-panel');
  await page.getByRole('button', { name: 'Ajouter : Cylindre' }).click();
  await setField(page, 'Diamètre', 10); await setField(page, 'Hauteur', 100);
  await expect(page.locator('.at-total')).toHaveText('Total : 10 × 10 × 100 cm');
  // Pencher de 30° vers l'avant : la hauteur devient environ 100 × cos 30° + 10 × sin 30° ≈ 92 cm
  await setField(page, 'Pencher vers l’avant', 30);
  await expect(page.locator('.at-total')).toHaveText('Total : 10 × 59 × 92 cm');
  await setField(page, 'Tourner (vue de dessus)', 37);
  await expect(panel.getByLabel('Tourner (vue de dessus)', { exact: true })).toHaveValue('37');
  await panel.getByRole('button', { name: 'Remettre droit' }).click();
  await expect(page.locator('.at-total')).toHaveText('Total : 10 × 10 × 100 cm');
  await page.getByRole('button', { name: 'Ajouter à Mes créations' }).click();
  // Dans la boutique : angle exact au clavier
  await page.locator('.fc', { hasText: 'Mon meuble' }).dblclick();
  const angle = page.getByTestId('panel').getByLabel('Angle exact (vue de dessus)', { exact: true });
  await angle.fill('37'); await angle.press('Enter');
  const d = await doc(page);
  expect(d.objects[0].rot).toBe(37);
});
