import { test, expect, type Page } from '@playwright/test';
import { distUrl } from './util';

/* Étape 2 : tracé du sol, murs, ouvertures, annuler / rétablir, vues 2D et 3D — en file://. */

type P = { x: number; y: number };
const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);
const screen = (page: Page, p: P) => page.evaluate(q => (window as any).cs3d.editor.plan.toScreen(q), p);
const clickPlan = async (page: Page, p: P, opts: { clickCount?: number } = {}) => { const s = await screen(page, p); await page.mouse.click(s.x, s.y, opts); };

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('index.html'));
  await page.getByTestId('new-project').click();
  await expect(page.getByTestId('panel')).toContainText('Tracer le sol');
});
test.afterEach(() => expect(errors).toEqual([]));

async function drawRect(page: Page, w: number, h: number) {
  for (const p of [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]) await clickPlan(page, p);
  await clickPlan(page, { x: 0, y: 0 }); // clic sur le départ : ferme le sol
}

test('tracer un sol libre aimanté à la grille et le fermer', async ({ page }) => {
  // Points volontairement imprécis : l'aimantation les ramène sur la grille de 10 cm.
  for (const p of [{ x: 0.02, y: 0.01 }, { x: 6.03, y: 0 }, { x: 6, y: 4.04 }, { x: 0, y: 3.98 }]) await clickPlan(page, p);
  await expect(page.getByText('4 points posés')).toBeVisible();
  await page.getByRole('button', { name: 'Fermer le sol' }).click();
  const d = await doc(page);
  expect(d.floor.points).toHaveLength(4);
  for (const q of d.floor.points) { expect(Math.round(q.x * 10) / 10).toBeCloseTo(q.x, 6); expect(Math.round(q.y * 10) / 10).toBeCloseTo(q.y, 6); }
  expect(d.walls.styles).toHaveLength(4);
  await expect(page.getByTestId('panel')).toContainText('24 m²');
});

test('saisir une longueur au clavier pendant le tracé', async ({ page }) => {
  await clickPlan(page, { x: 0, y: 0 });
  const s = await screen(page, { x: 3, y: 0 });
  await page.mouse.move(s.x, s.y);
  await page.keyboard.type('5');
  await page.keyboard.press('Enter');
  const d = await page.evaluate(() => (window as any).cs3d.ui.s.draft);
  expect(d).toHaveLength(2);
  expect(d[1].x).toBeCloseTo(5, 3);
  expect(d[1].y).toBeCloseTo(0, 3);
});

test('rectangle aux dimensions exactes, puis annuler et rétablir', async ({ page }) => {
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const fields = page.getByTestId('panel').locator('input');
  await fields.nth(0).fill('8,5'); await fields.nth(0).press('Enter');
  await fields.nth(1).fill('6'); await fields.nth(1).press('Enter');
  await page.getByRole('button', { name: 'Créer ce rectangle' }).click();
  let d = await doc(page);
  expect(d.floor.points.map((p: P) => [p.x, p.y])).toEqual([[0, 0], [8.5, 0], [8.5, 6], [0, 6]]);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).floor).toBeNull();
  await page.keyboard.press('Control+y');
  d = await doc(page);
  expect(d.floor.points).toHaveLength(4);
  await expect(page.getByTestId('panel')).toContainText('51 m²');
});

test('les côtés qui se croisent sont refusés', async ({ page }) => {
  for (const p of [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 4 }, { x: 4, y: 4 }]) await clickPlan(page, p);
  await page.getByRole('button', { name: 'Fermer le sol' }).click();
  await expect(page.getByText('Les côtés se croisent')).toBeVisible();
  expect((await doc(page)).floor).toBeNull();
});

test('modifier les sommets : déplacer, ajouter, retirer', async ({ page }) => {
  await drawRect(page, 6, 4);
  // Déplacer le sommet (6,4) vers (7,5)
  const a = await screen(page, { x: 6, y: 4 }), b = await screen(page, { x: 7, y: 5 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  let d = await doc(page);
  expect(d.floor.points.some((p: P) => p.x === 7 && p.y === 5)).toBe(true);
  // Ajouter un point au milieu du mur du haut (poignée « + »)
  await clickPlan(page, { x: 3, y: 0 });
  d = await doc(page);
  expect(d.floor.points).toHaveLength(5);
  expect(d.walls.styles).toHaveLength(5);
  // Le nouveau point est sélectionné : Suppr le retire
  await page.keyboard.press('Delete');
  expect((await doc(page)).floor.points).toHaveLength(4);
  // Un seul Ctrl+Z annule tout le glisser (une seule entrée d'historique)
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
  d = await doc(page);
  expect(d.floor.points.some((p: P) => p.x === 6 && p.y === 4)).toBe(true);
});

test('poser, déplacer et supprimer des portes et fenêtres', async ({ page }) => {
  await drawRect(page, 8, 5);
  await page.locator('[data-tool="ouvertures"]').click();
  // Une porte au milieu du mur du bas (mur n° 3, de (8,5) vers (0,5))
  await clickPlan(page, { x: 4, y: 5.07 });
  let d = await doc(page);
  expect(d.openings).toHaveLength(1);
  expect(d.openings[0]).toMatchObject({ type: 'porte', wall: 2, width: 0.9, sill: 0 });
  expect(d.openings[0].t).toBeCloseTo(4, 1);
  await expect(page.getByTestId('panel')).toContainText('Sur le mur n° 3');
  // Une fenêtre sur le mur du haut
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Fenêtre', exact: true }).click();
  await clickPlan(page, { x: 2, y: -0.07 });
  d = await doc(page);
  expect(d.openings).toHaveLength(2);
  expect(d.openings[1]).toMatchObject({ type: 'fenetre', wall: 0, sill: 1 });
  // Largeur au clavier
  const width = page.getByTestId('panel').getByLabel('Largeur');
  await width.fill('150'); await width.press('Enter');
  expect((await doc(page)).openings[1].width).toBeCloseTo(1.5, 5);
  // Glisser la fenêtre le long du mur
  const a = await screen(page, { x: 2, y: -0.07 }), b = await screen(page, { x: 5, y: -0.07 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  expect((await doc(page)).openings[1].t).toBeCloseTo(5, 1);
  // Supprimer avec Suppr puis annuler
  await page.keyboard.press('Delete');
  expect((await doc(page)).openings).toHaveLength(1);
  await page.keyboard.press('Control+z');
  expect((await doc(page)).openings).toHaveLength(2);
});

test('les ouvertures ne se chevauchent pas', async ({ page }) => {
  await drawRect(page, 3, 3);
  await page.locator('[data-tool="ouvertures"]').click();
  await clickPlan(page, { x: 0.8, y: -0.07 }); // porte de 90 cm sur un mur de 3 m
  await page.keyboard.press("Escape");
  await clickPlan(page, { x: 2.3, y: -0.07 }); // une seconde porte tient encore
  await page.keyboard.press("Escape");
  await clickPlan(page, { x: 1.55, y: -0.07 }); // entre les deux : plus de place
  await expect(page.getByText('Plus de place sur ce mur.')).toBeVisible();
  const d = await doc(page);
  expect(d.openings).toHaveLength(2);
  const [o1, o2] = d.openings;
  expect(Math.abs(o1.t - o2.t)).toBeGreaterThanOrEqual(0.9 + 0.1 - 1e-6);
});

test('régler les murs et basculer en 3D', async ({ page }) => {
  await drawRect(page, 5, 4);
  await page.locator('[data-tool="murs"]').click();
  const hgt = page.getByTestId('panel').getByLabel('Hauteur');
  await hgt.fill('250'); await hgt.press('Enter');
  expect((await doc(page)).walls.height).toBeCloseTo(2.5, 5);
  // Choisir un mur sur le plan et changer sa matière
  await clickPlan(page, { x: 2.5, y: -0.07 });
  await expect(page.getByTestId('panel')).toContainText('Mur n° 1');
  await page.getByRole('button', { name: 'Brique' }).click();
  const d = await doc(page);
  expect(d.walls.styles[0].material).toBe('brique');
  expect(d.walls.styles[1].material).toBe('peinture');
  // Vue 3D : le canevas se dessine
  await page.locator('button[data-view="3d"]').click();
  await page.waitForTimeout(800);
  const painted = await page.evaluate(() => {
    const c = document.querySelector('.vp-3d canvas') as HTMLCanvasElement;
    const t = document.createElement('canvas'); t.width = 64; t.height = 64;
    const g = t.getContext('2d')!; g.drawImage(c, 0, 0, 64, 64);
    const px = g.getImageData(0, 0, 64, 64).data; const set = new Set<number>();
    for (let i = 0; i < px.length; i += 16) set.add((px[i] >> 4) * 256 + (px[i + 1] >> 4) * 16 + (px[i + 2] >> 4));
    return set.size;
  });
  expect(painted).toBeGreaterThan(10); // pas une image unie
  await expect(page.getByRole('button', { name: 'Plan 2D' })).toBeVisible();
});
