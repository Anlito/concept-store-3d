import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { distUrl } from './util';

/* Cloisons intérieures : tracé, réglages, portes et passages, renumérotation, 3D et plan A3. */

const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);
const screen = (page: Page, p: { x: number; y: number }) => page.evaluate(q => (window as any).cs3d.editor.plan.toScreen(q), p);
const clickPlan = async (page: Page, p: { x: number; y: number }) => {
  const s = await screen(page, p);
  await page.mouse.move(s.x, s.y); await page.mouse.click(s.x, s.y);
};

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click(); // 10 × 7 m
  await page.getByRole('button', { name: 'Plan 2D' }).click();
  await page.locator('[data-tool=sol]').click();
});
test.afterEach(() => expect(errors).toEqual([]));

/** Réserve dans l'angle : cloison (7, 0) → (7, 3), puis (7, 3) → (10, 3). */
async function drawStore(page: Page) {
  await page.getByRole('button', { name: 'Tracer une cloison' }).click();
  await clickPlan(page, { x: 7, y: 0.03 }); // aimanté contre la face du mur
  await clickPlan(page, { x: 7, y: 3 });
  await clickPlan(page, { x: 9.97, y: 3 });
  await page.keyboard.press('Escape');
}

test('tracer des cloisons enchaînées, aimantées aux murs', async ({ page }) => {
  await drawStore(page);
  const d = await doc(page);
  expect(d.partitions.map((c: any) => [c.a, c.b])).toEqual([[{ x: 7, y: 0 }, { x: 7, y: 3 }], [{ x: 7, y: 3 }, { x: 10, y: 3 }]]);
  expect(await page.evaluate(() => (window as any).cs3d.ui.s.partDraw)).toBe(false);
  // Une cloison ne commence pas hors de la boutique.
  await page.getByRole('button', { name: 'Tracer une cloison' }).click();
  await clickPlan(page, { x: 12, y: 2 });
  await expect(page.locator('.toast')).toContainText('à l’intérieur de la boutique');
  expect(await page.evaluate(() => (window as any).cs3d.ui.s.draft.length)).toBe(0);
  await page.getByRole('button', { name: 'Terminer le tracé' }).click();
  // Annuler retire la dernière cloison.
  await page.keyboard.press('Control+z');
  expect((await doc(page)).partitions).toHaveLength(1);
});

test('régler une cloison : longueur, hauteur, côtés, 3D', async ({ page }) => {
  await drawStore(page);
  await clickPlan(page, { x: 8.5, y: 3 }); // cloison n° 2
  const panel = page.getByTestId('panel');
  await expect(panel).toContainText('Cloison n° 2');
  await panel.getByLabel('Longueur').fill('250'); await panel.getByLabel('Longueur').press('Enter');
  await panel.getByLabel('Hauteur').fill('120'); await panel.getByLabel('Hauteur').press('Enter');
  await expect(panel).toContainText('prend le revêtement des murs de sa pièce');
  const c = (await doc(page)).partitions[1];
  expect(c.b).toEqual({ x: 9.5, y: 3 });
  expect(c.height).toBe(1.2);
  // Trop longue : elle sortirait de la boutique.
  await panel.getByLabel('Longueur').fill('900'); await panel.getByLabel('Longueur').press('Enter');
  await expect(page.locator('.toast')).toContainText('sortirait');
  // En 3D, chaque cloison est construite.
  await page.getByRole('button', { name: 'Vue 3D' }).click();
  const names = await page.evaluate(() => { const n: string[] = []; (window as any).cs3d.editor.view3d.scene.traverse((o: any) => { if (o.name.startsWith('cloison')) n.push(o.name); }); return n; });
  expect(names.sort()).toEqual(['cloison-1', 'cloison-2']);
});

test('glisser une extrémité et toute la cloison', async ({ page }) => {
  await drawStore(page);
  await clickPlan(page, { x: 8.5, y: 3 });
  const end = await screen(page, { x: 10, y: 3 }), to = await screen(page, { x: 9, y: 3 });
  await page.mouse.move(end.x, end.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 6 }); await page.mouse.up();
  expect((await doc(page)).partitions[1].b).toEqual({ x: 9, y: 3 });
  const mid = await screen(page, { x: 8, y: 3 }), mid2 = await screen(page, { x: 8, y: 4 });
  await page.mouse.move(mid.x, mid.y); await page.mouse.down(); await page.mouse.move(mid2.x, mid2.y, { steps: 6 }); await page.mouse.up();
  expect((await doc(page)).partitions[1]).toMatchObject({ a: { x: 7, y: 4 }, b: { x: 9, y: 4 } });
});

test('porte ou passage dans une cloison, suivis quand le sol change, supprimés avec elle', async ({ page }) => {
  await drawStore(page);
  await page.locator('[data-tool=ouvertures]').click();
  await page.getByRole('button', { name: /Passage/ }).click();
  await clickPlan(page, { x: 7, y: 1.5 });
  let d = await doc(page);
  const op = d.openings.find((o: any) => o.wall === 4);
  expect(op).toMatchObject({ type: 'porte', style: 'passage' });
  await clickPlan(page, { x: 7, y: 1.5 }); // la choisir
  await expect(page.getByTestId('panel')).toContainText('Sur la cloison n° 1');

  // Un point ajouté au sol décale la numérotation : la porte reste sur la cloison.
  await page.locator('[data-tool=sol]').click();
  await clickPlan(page, { x: 5, y: 0 }); // poignée « + » au milieu du mur n° 1
  d = await doc(page);
  expect(d.floor.points).toHaveLength(5);
  expect(d.openings.find((o: any) => o.id === op.id).wall).toBe(5);

  // Supprimer la cloison retire sa porte ; la cloison suivante devient le mur n° 5.
  await page.locator('[data-tool=sol]').click();
  await clickPlan(page, { x: 7, y: 2.6 });
  await expect(page.getByTestId('panel')).toContainText('Cloison n° 1');
  await page.keyboard.press('Delete');
  d = await doc(page);
  expect(d.partitions).toHaveLength(1);
  expect(d.openings.some((o: any) => o.id === op.id)).toBe(false);
  await expect(page.locator('.toast')).toContainText('Cloison supprimée');
});

test('le plan A3 dessine les cloisons ; le fichier projet les garde, avec leurs portes', async ({ page }, info) => {
  await drawStore(page);
  await page.locator('[data-tool=ouvertures]').click();
  await clickPlan(page, { x: 8.5, y: 3 }); // porte sur la cloison n° 2
  await page.getByRole('button', { name: 'Plan A3' }).click();
  await expect(page.locator('.ex-sheet svg')).toContainText('3,00 m'); // longueur des cloisons
  await page.getByRole('button', { name: 'Retour à l’éditeur' }).click();

  const saved = await doc(page);
  const file = info.outputPath('cloisons.json');
  writeFileSync(file, JSON.stringify(saved));
  await page.addInitScript(() => { delete (window as any).showOpenFilePicker; });
  await page.goto(distUrl('index.html'));
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('open-project').click();
  await (await chooser).setFiles(file);
  const d = await doc(page);
  expect(d.partitions).toEqual(saved.partitions);
  expect(d.openings.filter((o: any) => o.wall === 5)).toHaveLength(1);
});

test('depuis l’outil Surface : cloison à la longueur tapée au clavier', async ({ page }) => {
  await page.locator('[data-tool=sol]').click();
  const card = page.getByTestId('panel').locator('.p-cta');
  await expect(card).toContainText('Cloisons et pièces');
  await card.getByRole('button', { name: 'Tracer une cloison' }).click();
  expect(await page.evaluate(() => (window as any).cs3d.ui.s.tool)).toBe('sol');
  await clickPlan(page, { x: 6, y: 0.03 });
  const towards = await screen(page, { x: 6, y: 5 });
  await page.mouse.move(towards.x, towards.y); // la souris montre la direction
  await page.keyboard.type('250');
  await expect(page.getByLabel('Longueur de la cloison')).toHaveValue('250');
  await page.keyboard.press('Enter');
  expect((await doc(page)).partitions.map((c: any) => [c.a, c.b])).toEqual([[{ x: 6, y: 0 }, { x: 6, y: 2.5 }]]);
  await page.keyboard.press('Escape');
  // Un clic sur la cloison garde l'outil Surface et ouvre ses réglages.
  await clickPlan(page, { x: 6, y: 1.2 });
  await expect(page.getByTestId('panel')).toContainText('Cloison n° 1');
  expect(await page.evaluate(() => (window as any).cs3d.ui.s.tool)).toBe('sol');
});

test('pièces : chaque pièce a son sol et ses murs, un mur coupé par une cloison change de revêtement', async ({ page }) => {
  await drawStore(page);
  expect(await page.evaluate(() => (window as any).cs3d.rooms())).toEqual([{ area: 9, holes: 0 }, { area: 61, holes: 0 }]);
  // Sol de la réserve (pièce 1)
  await page.locator('[data-tool=revetement]').click();
  await expect(page.getByTestId('panel')).toContainText('Clique dans une pièce');
  await clickPlan(page, { x: 8.5, y: 1.5 });
  await expect(page.getByTestId('panel')).toContainText('Sol de la pièce n° 1');
  await page.getByRole('button', { name: 'Carrelage' }).click();
  // Murs de la réserve : clic sur le mur du fond, côté réserve
  await page.locator('[data-tool=murs]').click();
  const mats = () => page.evaluate(() => { const g = (window as any).cs3d.editor.view3d.scene.getObjectByName('mur-1'); const m = new Set<string>(); g.traverse((o: any) => { if (o.isMesh) m.add(o.material.uuid); }); return m.size; });
  const before = await mats();
  await clickPlan(page, { x: 8.5, y: 0.03 });
  await expect(page.getByTestId('panel')).toContainText('Murs de la pièce n° 1');
  await page.getByRole('button', { name: 'Brique' }).click();
  let d = await doc(page);
  expect(d.rooms).toHaveLength(1);
  expect(d.rooms[0]).toMatchObject({ floor: { material: 'carrelage' }, wall: { material: 'brique' } });
  expect(d.floor.material).toBe('parquet'); // le reste de la boutique ne change pas
  // Le mur n° 1 a maintenant deux revêtements intérieurs (boutique / réserve)
  await page.getByRole('button', { name: 'Vue 3D' }).click();
  expect(await mats()).toBe(before + 1);
  const floors = await page.evaluate(() => { const n: string[] = []; (window as any).cs3d.editor.view3d.scene.traverse((o: any) => { if (o.name.startsWith('sol-piece')) n.push(o.name); }); return n.sort(); });
  expect(floors).toEqual(['sol-piece-1', 'sol-piece-2']);
  // « Appliquer à toutes les pièces » : plus de revêtement propre
  await page.getByRole('button', { name: 'Plan 2D' }).click();
  await page.getByRole('button', { name: 'Appliquer à toutes les pièces' }).click();
  d = await doc(page);
  expect(d.rooms[0].wall).toBeUndefined();
  expect(d.walls.styles.every((s: any) => s.material === 'brique')).toBe(true);
  // Sans cloison, une seule pièce ; le revêtement accroché reste dans le fichier
  await page.locator('[data-tool=sol]').click();
  await clickPlan(page, { x: 8.5, y: 3 }); await page.keyboard.press('Delete');
  expect(await page.evaluate(() => (window as any).cs3d.rooms())).toEqual([{ area: 70, holes: 0 }]);
});

test('pièce au milieu d’une autre (cabine) : un trou dans le sol de la grande pièce', async ({ page }) => {
  await page.getByRole('button', { name: 'Tracer une cloison' }).click();
  for (const q of [{ x: 4, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 4 }, { x: 4, y: 4 }, { x: 4, y: 2 }]) await clickPlan(page, q);
  await page.keyboard.press('Escape');
  const rs = await page.evaluate(() => (window as any).cs3d.rooms());
  expect(rs.sort((a: any, b: any) => a.area - b.area)).toEqual([{ area: 4, holes: 0 }, { area: 66, holes: 1 }]);
});
