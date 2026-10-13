import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { distUrl } from './util';

/* Étage : ajout, changement de niveau, étage plus petit que le rez-de-chaussée (jamais plus grand),
   escalier (hauteur, trémie), fichier enregistré, plan A3 de deux pages. */

const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);
const screen = (page: Page, p: { x: number; y: number }) => page.evaluate(q => (window as any).cs3d.editor.plan.toScreen(q), p);

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => { delete (window as any).showSaveFilePicker; delete (window as any).showOpenFilePicker; });
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click(); // 10 × 7 m
});
test.afterEach(() => expect(errors).toEqual([]));

/** Un escalier droit au rez-de-chaussée, contre le mur de gauche. */
async function poserEscalier(page: Page) {
  await page.locator('[data-tool=mobilier]').click();
  await page.locator('.lib-cat', { hasText: 'Escaliers' }).click();
  await page.locator('.fc', { hasText: 'Escalier droit' }).first().dblclick();
  await expect.poll(async () => (await doc(page)).objects.filter((o: any) => o.model === 'v-escalier-droit').length).toBe(1);
  await page.evaluate(() => (window as any).cs3d.store.update((d: any) => { const o = d.objects.find((x: any) => x.model === 'v-escalier-droit'); o.x = 1; o.y = 3.5; o.rot = 0; }));
}

test('ajouter un étage, passer d’un niveau à l’autre, chaque niveau garde ses meubles', async ({ page }) => {
  await poserEscalier(page);
  const esc = (await doc(page)).objects.find((o: any) => o.model === 'v-escalier-droit');
  expect(esc.size.h).toBeCloseTo(3, 5); // jusqu'à l'étage : hauteur des murs du rez-de-chaussée
  await page.locator('.lvl-add').click();
  let d = await doc(page);
  expect(d.niveau).toBe(1);
  expect(d.floor.points).toHaveLength(4); // même contour au départ
  expect(d.objects).toEqual([]); // l'étage est vide
  expect(d.autreNiveau.objects.length).toBeGreaterThan(0);
  await expect(page.locator('.lvl-b.on')).toHaveText('Étage');
  // Le panneau ne rappelle pas l'escalier : il y en a un au rez-de-chaussée
  await page.locator('[data-tool=sol]').click();
  await expect(page.getByTestId('panel')).not.toContainText('Pense à l’escalier');
  // Plan de l'étage : trémie au-dessus de l'escalier, rez-de-chaussée en pointillés
  await page.getByRole('button', { name: 'Plan 2D' }).click();
  await expect(page.locator('[data-tremie]')).toHaveCount(1);
  await expect(page.locator('[data-autre-niveau]')).toHaveCount(1);
  // Retour au rez-de-chaussée : ses meubles sont là
  await page.locator('.lvl-b[data-niveau="0"]').click();
  d = await doc(page);
  expect(d.niveau).toBe(0);
  expect(d.objects.some((o: any) => o.model === 'v-escalier-droit')).toBe(true);
  // 3D : l'étage s'affiche au-dessus, au choix
  await page.getByRole('button', { name: 'Vue 3D' }).click();
  const visible = () => page.evaluate(() => (window as any).cs3d.editor.view3d.scene.getObjectByName('autre-niveau').visible);
  expect(await visible()).toBe(false);
  await page.locator('.lvl-voir').click();
  expect(await visible()).toBe(true);
});

test('l’étage peut être plus petit, jamais plus grand que le rez-de-chaussée', async ({ page }) => {
  await page.getByRole('button', { name: 'Plan 2D' }).click();
  await page.locator('.lvl-add').click();
  // Rétrécir : le coin (10, 7) passe en (6, 7)
  const from = await screen(page, { x: 10, y: 7 }), to = await screen(page, { x: 6, y: 7 });
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
  let d = await doc(page);
  expect(d.floor.points).toContainEqual({ x: 6, y: 7 });
  // Agrandir au-delà du rez-de-chaussée : refusé
  const from2 = await screen(page, { x: 0, y: 0 }), to2 = await screen(page, { x: -2, y: 0 });
  await page.mouse.move(from2.x, from2.y); await page.mouse.down(); await page.mouse.move(to2.x, to2.y, { steps: 8 }); await page.mouse.up();
  d = await doc(page);
  expect(d.floor.points.map((q: any) => ({ x: q.x + 0, y: q.y + 0 }))).toContainEqual({ x: 0, y: 0 }); // le coin n'est pas sorti
  expect(d.floor.points.every((q: any) => q.x >= 0)).toBe(true);
  // Sans escalier : rappel dans le panneau
  await expect(page.getByTestId('panel')).toContainText('Pense à l’escalier');
  // Supprimer l'étage
  await page.getByRole('button', { name: 'Supprimer l’étage' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer l’étage' }).click();
  d = await doc(page);
  expect(d.autreNiveau).toBeUndefined();
  await expect(page.locator('.lvl-add')).toBeVisible();
});

test('fichier : le rez-de-chaussée devant, même enregistré depuis l’étage ; plan A3 de deux pages', async ({ page }) => {
  await poserEscalier(page);
  await page.locator('.lvl-add').click(); // on est à l'étage
  await page.evaluate(() => (window as any).cs3d.store.update((d: any) => { d.name = 'Deux niveaux'; }));
  const dl = page.waitForEvent('download');
  await page.keyboard.press('Control+s');
  const json = JSON.parse(readFileSync(await (await dl).path(), 'utf8'));
  expect(json.niveau ?? 0).toBe(0);
  expect(json.objects.some((o: any) => o.model === 'v-escalier-droit')).toBe(true); // le RDC est au premier plan
  expect(json.autreNiveau.floor.points).toHaveLength(4);
  // Plan A3 : une page par niveau
  await page.getByRole('button', { name: 'Plan A3' }).click();
  await expect(page.getByRole('tab', { name: /Page 2 · Étage/ })).toBeVisible();
  await page.getByLabel('Nom de l’équipe').fill('Les Bâtisseurs');
  await page.getByLabel('Prénoms').fill('Léa, Malik');
  await page.getByLabel('Classe').fill('4e B');
  const pdf = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Enregistrer le PDF' }).click();
  const bytes = readFileSync(await (await pdf).path(), 'latin1');
  expect(bytes.match(/\/Type \/Page[^s]/g)?.length).toBe(2);
});
