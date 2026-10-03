import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { distUrl } from './util';

/* Étape 7 : import Tinkercad (OBJ) et import d'images (PNG / JPG) — en file://. */

const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);
const FIX = 'tests/fixtures/';

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
});
test.afterEach(() => expect(errors).toEqual([]));

async function openAtelier(page: Page) {
  await page.locator('[data-tool="mobilier"]').click();
  await page.getByTestId('library').getByRole('button', { name: 'Créer un meuble' }).click();
}
async function importObj(page: Page, files: string[] | { name: string; mimeType: string; buffer: Buffer }) {
  const fc = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Importer un fichier Tinkercad (OBJ)' }).click();
  await (await fc).setFiles(files as never);
}

test('Tinkercad : le .zip exporté devient un volume, en mètres, avec ses couleurs', async ({ page }) => {
  await openAtelier(page);
  await importObj(page, [FIX + 'tinkercad-export.zip']);
  await expect(page.getByText('« tinkercad-export » importé')).toBeVisible();
  await expect(page.locator('.at-total')).toHaveText('Total : 10 × 6 × 6 cm'); // 100 × 60 × 60 mm
  const panel = page.getByTestId('atelier-panel');
  await expect(panel).toContainText('Taille dans Tinkercad : 100 × 60 × 60 mm · 24 triangles');
  // Agrandir en gardant les proportions : hauteur 6 → 90 cm, longueur 10 → 150 cm
  const hgt = panel.getByLabel('Hauteur', { exact: true }); await hgt.fill('90'); await hgt.press('Enter');
  await expect(page.locator('.at-total')).toHaveText('Total : 150 × 90 × 90 cm');
  await page.getByRole('button', { name: 'Ajouter à Mes créations' }).click();
  await page.locator('.fc', { hasText: 'Mon meuble' }).dblclick();
  const d = await doc(page);
  const v = d.creations[0].volumes[0];
  expect(v.type).toBe('modele');
  expect(v.mesh.parts.map((p: any) => p.color).sort()).toEqual(['#5c6b7a', '#bf4d36']);
  expect(d.objects[0].size.w).toBeCloseTo(1.5, 2);
  expect(d.objects[0].size.h).toBeCloseTo(0.9, 2);
});

test('Tinkercad : .obj et .mtl séparés, .obj seul (gris), fichiers refusés', async ({ page }) => {
  await openAtelier(page);
  await importObj(page, [FIX + 'tinker.obj', FIX + 'obj.mtl']);
  await expect(page.getByTestId('volumes')).toContainText('tinker');
  await importObj(page, [FIX + 'tinker.obj']);
  await expect(page.getByText('Pas de fichier .mtl')).toBeVisible();
  await importObj(page, { name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('x') });
  await expect(page.getByText('n’est pas un fichier Tinkercad')).toBeVisible();
  await importObj(page, { name: 'enorme.obj', mimeType: 'text/plain', buffer: Buffer.alloc(6 * 1024 * 1024, 32) });
  await expect(page.getByText('Maximum : 5 Mo')).toBeVisible();
  const n = await page.locator('.at-row').count();
  expect(n).toBe(2);
});

async function addImage(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer }, target: string, place = true) {
  await page.getByRole('button', { name: 'Ajouter une image' }).click();
  const dlg = page.getByTestId('image-dialog');
  const fc = page.waitForEvent('filechooser');
  await dlg.getByRole('button', { name: /Choisir une (autre )?image/ }).click();
  await (await fc).setFiles(file as never);
  await dlg.getByRole('button', { name: target, exact: true }).click();
  if (place) await dlg.getByRole('button', { name: 'Placer l’image' }).click();
  return dlg;
}

test('images : cadre, tapisserie, tapis, vitrine ; PNG transparent gardé, JPG compressé', async ({ page }) => {
  await page.locator('[data-tool="images"]').click();
  await addImage(page, FIX + 'affiche.jpg', 'Cadre');
  await expect(page.getByTestId('panel')).toContainText('affiche.jpg');
  await page.keyboard.press('Escape');
  await addImage(page, FIX + 'motif.jpg', 'Tapisserie murale');
  await page.keyboard.press('Escape');
  await addImage(page, FIX + 'affiche.jpg', 'Tapis au sol'); // même image : stockée une seule fois
  await page.keyboard.press('Escape');
  await addImage(page, FIX + 'soldes.png', 'Vitrine');
  const d = await doc(page);
  expect(d.images.map((i: any) => [i.target, i.repeat])).toEqual([['cadre', false], ['tapisserie', true], ['tapis', false], ['vitrine', false]]);
  expect(d.assets).toHaveLength(3);
  expect(d.assets.find((a: any) => a.name === 'soldes.png').data).toMatch(/^data:image\/png/);
  expect(d.assets.find((a: any) => a.name === 'motif.jpg').data).toMatch(/^data:image\/jpeg/);
  // Réglages au panneau : la vitrine passe à 150 cm de large
  const panel = page.getByTestId('panel');
  await panel.getByLabel('Largeur', { exact: true }).fill('150');
  await panel.getByLabel('Largeur', { exact: true }).dispatchEvent('change');
  expect((await doc(page)).images[3].size).toBeCloseTo(1.5, 5);
  // Supprimer puis annuler
  await panel.getByRole('button', { name: 'Supprimer' }).click();
  expect((await doc(page)).images).toHaveLength(3);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).images).toHaveLength(4);
});

test('images : trop lourde ou mauvais format refusée, grande image réduite à 2048 px', async ({ page }, info) => {
  await page.locator('[data-tool="images"]').click();
  let dlg = await addImage(page, { name: 'enorme.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024) }, 'Cadre', false);
  await expect(dlg.getByText('Fichier trop lourd')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Placer l’image' })).toBeDisabled();
  await dlg.getByRole('button', { name: 'Annuler' }).click();
  dlg = await addImage(page, { name: 'anim.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') }, 'Cadre', false);
  await expect(dlg.getByText('n’est pas une image PNG ou JPG')).toBeVisible();
  await dlg.getByRole('button', { name: 'Annuler' }).click();
  // Grande image : 3000 × 1500 px
  const big = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3000; c.height = 1500; const g = c.getContext('2d')!; g.fillStyle = '#6E8B6B'; g.fillRect(0, 0, 3000, 1500); return c.toDataURL('image/jpeg').split(',')[1]; });
  const file = info.outputPath('grande.jpg'); writeFileSync(file, Buffer.from(big, 'base64'));
  dlg = await addImage(page, file, 'Tapis au sol', false);
  await expect(dlg).toContainText('réduite à 2048 × 1024 px');
  await dlg.getByRole('button', { name: 'Placer l’image' }).click();
  const a = (await doc(page)).assets[0];
  expect([a.w, a.h]).toEqual([2048, 1024]);
});

test('les images ne sont pas sur le plan A3, mais sont enregistrées dans le projet', async ({ page }, info) => {
  await page.addInitScript(() => { delete (window as any).showSaveFilePicker; delete (window as any).showOpenFilePicker; });
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  const svgLines = async () => {
    await page.getByRole('button', { name: 'Plan A3' }).click();
    const n = await page.getByTestId('sheet').locator('line, rect, text').count();
    await page.getByRole('button', { name: 'Retour à l’éditeur' }).click();
    return n;
  };
  const before = await svgLines();
  await page.locator('[data-tool="images"]').click();
  await addImage(page, FIX + 'affiche.jpg', 'Cadre');
  await page.keyboard.press('Escape');
  await addImage(page, FIX + 'motif.jpg', 'Tapis au sol');
  expect(await svgLines()).toBe(before);
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const f = info.outputPath('p.json'); await (await dl).saveAs(f);
  const json = JSON.parse(readFileSync(f, 'utf8'));
  expect(json.images).toHaveLength(2);
  expect(json.assets).toHaveLength(2);
  expect(json.assets[0].data).toMatch(/^data:image\//);
});
