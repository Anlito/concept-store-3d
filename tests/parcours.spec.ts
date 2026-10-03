import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { distUrl } from './util';

/* Critère de validation : « un élève trace une boutique, place des objets et exporte son PDF A3
   en moins d'une séance, sans aide extérieure ». Parcours complet, au clavier et à la souris. */

const screen = (page: Page, p: { x: number; y: number }) => page.evaluate(q => (window as any).cs3d.editor.plan.toScreen(q), p);
const clickPlan = async (page: Page, p: { x: number; y: number }) => { const s = await screen(page, p); await page.mouse.click(s.x, s.y); };

test('parcours complet d’une équipe, de l’accueil au PDF A3 et à la photo', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { delete (window as any).showSaveFilePicker; delete (window as any).showOpenFilePicker; });
  const t0 = Date.now();
  await page.goto(distUrl('index.html'));
  // 1. Nouveau projet, sol de 9 × 6 m tracé point par point (pas de 1 m)
  await page.getByTestId('new-project').click();
  await page.locator('.tb-name').fill('Le Comptoir Vert'); await page.locator('.tb-name').press('Enter');
  for (const p of [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 6 }, { x: 0, y: 6 }]) await clickPlan(page, p);
  await clickPlan(page, { x: 0, y: 0 });
  // 2. Façade : une porte vitrée et une vitrine sur le mur du bas (mur n° 3)
  await page.locator('[data-tool="ouvertures"]').click();
  await page.getByTestId('panel').getByRole('button', { name: 'Vitrée', exact: true }).click();
  await clickPlan(page, { x: 6.5, y: 6.05 });
  await page.keyboard.press('Escape');
  await page.getByTestId('panel').getByRole('button', { name: 'Vitrine', exact: true }).click();
  await clickPlan(page, { x: 3, y: 6.05 });
  // 3. Trois meubles
  await page.locator('[data-tool="mobilier"]').click();
  for (const n of ['Comptoir caisse', 'Portant long', 'Plante en pot']) {
    await page.evaluate(() => (window as any).cs3d.ui.set({ libraryOpen: true }));
    await page.locator('.fc', { hasText: n }).first().dblclick();
  }
  // 4. Vue 3D et photo
  await page.locator('button[data-view="3d"]').click();
  await page.getByRole('button', { name: 'Photo' }).click();
  await page.getByTestId('photo-dialog').getByRole('button', { name: '3/4 gauche' }).click();
  const photo = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Enregistrer la photo' }).click();
  expect((await photo).suggestedFilename()).toBe('le-comptoir-vert-gauche.png');
  // 5. Plan A3 : cartouche et PDF
  await page.getByRole('button', { name: 'Plan A3' }).click();
  await page.getByLabel('Nom de l’équipe').fill('Les Bâtisseurs');
  await page.getByLabel('Prénoms').fill('Léa, Malik, Inès, Tom');
  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Télécharger le PDF' }).click();
  const pdfFile = info.outputPath('plan.pdf'); await (await pdf).saveAs(pdfFile);
  expect(readFileSync(pdfFile).subarray(0, 5).toString()).toBe('%PDF-');
  await page.getByRole('button', { name: 'Retour à l’éditeur' }).click();
  // 6. Enregistrer le projet
  const save = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const json = JSON.parse(readFileSync(await (await save).path()!, 'utf8'));
  expect(json).toMatchObject({ name: 'Le Comptoir Vert', team: { name: 'Les Bâtisseurs' } });
  expect(json.openings.map((o: any) => [o.type, o.style ?? null]).sort()).toEqual([['porte', 'vitree'], ['vitrine', null]]);
  expect(json.objects).toHaveLength(3);
  await expect(page.locator('.tb-status')).toHaveText('Enregistré');
  expect(errors).toEqual([]);
  console.log(`Parcours complet automatisé : ${((Date.now() - t0) / 1000).toFixed(1)} s`);
});

test('aide intégrée et page Crédits', async ({ page }) => {
  await page.goto(distUrl('index.html'));
  await page.getByRole('button', { name: 'Aide' }).click();
  const help = page.getByRole('dialog', { name: 'Aide · Concept Store 3D' });
  await expect(help).toContainText('Trace le sol');
  await expect(help).toContainText('Ctrl+S');
  await help.getByRole('button', { name: 'Crédits et licences' }).click();
  const cr = page.getByRole('dialog', { name: 'Crédits et licences' });
  await expect(cr).toContainText('Kenney');
  await expect(cr).toContainText('Kay Lousberg');
  await expect(cr).toContainText('CC0 1.0');
  await expect(cr).toContainText('Three.js');
});

test('photos du rendu 3D : PNG en 1920 × 1080, JPG carré, les 4 angles en .zip', async ({ page }) => {
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  const shoot = async (angle: string, opts: { jpg?: boolean; size?: string } = {}) => {
    await page.getByRole('button', { name: 'Photo', exact: true }).click();
    const dlg = page.getByTestId('photo-dialog');
    await dlg.getByRole('button', { name: angle }).click();
    if (opts.jpg) await dlg.getByRole('button', { name: 'JPG', exact: true }).click();
    if (opts.size) await dlg.getByLabel('Taille de l’image').selectOption(opts.size);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Enregistrer la photo' }).click();
    const d = await dl;
    return { name: d.suggestedFilename(), bytes: readFileSync((await d.path())!) };
  };
  const png = await shoot('Façade');
  expect(png.name).toBe('boutique-exemple-facade.png');
  expect([png.bytes.readUInt32BE(16), png.bytes.readUInt32BE(20)]).toEqual([1920, 1080]); // en-tête IHDR du PNG
  const jpg = await shoot('Intérieur', { jpg: true, size: 'carree' });
  expect(jpg.name).toBe('boutique-exemple-interieur.jpg');
  expect([...jpg.bytes.subarray(0, 2)]).toEqual([0xff, 0xd8]);
  const zip = await shoot('Les 4 angles (.zip)');
  expect(zip.name).toBe('boutique-exemple-photos.zip');
  const names = zip.bytes.toString('latin1').match(/boutique-exemple-[a-z]+\.png/g) ?? [];
  expect(new Set(names)).toEqual(new Set(['boutique-exemple-gauche.png', 'boutique-exemple-droite.png', 'boutique-exemple-facade.png', 'boutique-exemple-interieur.png']));
});
