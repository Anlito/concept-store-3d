import { test, expect, type Page } from '@playwright/test';
import { distUrl, nouveauProjet } from './util';

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
  await nouveauProjet(page);
  await expect(page.getByTestId('panel')).toContainText('Tracer la surface');
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
  await page.getByRole('button', { name: 'Fermer la surface' }).click();
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
  await page.getByRole('button', { name: 'Fermer la surface' }).click();
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
  // Après la pose, on reste en mode « pose » : changer de type ne transforme pas la porte posée.
  await expect(page.getByTestId('panel')).toContainText('À poser');
  await page.getByRole('button', { name: 'Fenêtre', exact: true }).click();
  expect((await doc(page)).openings[0].type).toBe('porte');
  await clickPlan(page, { x: 4, y: 5.07 }); // clic sur la porte : ses réglages
  await expect(page.getByTestId('panel')).toContainText('Sur le mur n° 3');
  await page.keyboard.press('Escape');
  // Une fenêtre sur le mur du haut
  await clickPlan(page, { x: 2, y: -0.07 });
  d = await doc(page);
  expect(d.openings).toHaveLength(2);
  expect(d.openings[1]).toMatchObject({ type: 'fenetre', wall: 0, sill: 1 });
  await clickPlan(page, { x: 2, y: -0.07 }); // la choisir
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
  // La hauteur des murs se règle avec la surface (le tracé)
  const hgt = page.getByTestId('panel').getByLabel('Hauteur');
  await hgt.fill('250'); await hgt.press('Enter');
  expect((await doc(page)).walls.height).toBeCloseTo(2.5, 5);
  // Murs : sans pièce choisie, la matière va à tous les murs
  await page.locator('[data-tool="murs"]').click();
  await page.getByRole('button', { name: 'Brique' }).click();
  let d = await doc(page);
  expect(d.walls.styles.every((s: any) => s.material === 'brique')).toBe(true);
  // Clic dans la pièce : tous ses murs
  await clickPlan(page, { x: 2.5, y: 2 });
  await expect(page.getByTestId('panel')).toContainText('Murs de la pièce n° 1');
  await page.getByRole('button', { name: 'Béton' }).click();
  d = await doc(page);
  expect(d.rooms[0].wall.material).toBe('beton');
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

test('la boutique ne dépasse pas 10 × 7 m', async ({ page }) => {
  // Rectangle trop profond : refusé
  await page.getByRole('button', { name: 'Rectangle', exact: true }).click();
  const fields = page.getByTestId('panel').locator('input');
  await fields.nth(0).fill('10'); await fields.nth(0).press('Enter');
  await fields.nth(1).fill('8'); await fields.nth(1).press('Enter');
  await page.getByRole('button', { name: 'Créer ce rectangle' }).click();
  await expect(page.getByText('La boutique ne doit pas dépasser 10 × 7 m.')).toBeVisible();
  expect((await doc(page)).floor).toBeNull();
  // 7 × 10 (dans l'autre sens) est accepté
  await fields.nth(0).fill('7'); await fields.nth(0).press('Enter');
  await fields.nth(1).fill('10'); await fields.nth(1).press('Enter');
  await page.getByRole('button', { name: 'Créer ce rectangle' }).click();
  expect((await doc(page)).floor.points).toHaveLength(4);
  // Glisser un sommet au-delà de la limite : le sommet s'arrête
  const a = await screen(page, { x: 7, y: 10 }), b = await screen(page, { x: 8.5, y: 10 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
  const pts = (await doc(page)).floor.points;
  expect(Math.max(...pts.map((p: P) => p.x))).toBeLessThanOrEqual(7);
});

test('pas d’aimantation : 1 m pour le sol, 10 cm pour le reste, réglable partout', async ({ page }) => {
  const s = () => page.evaluate(() => (window as any).cs3d.ui.s);
  // Outil Sol : pas de 1 m, les points tombent sur les mètres
  await expect(page.locator('.step').first()).toContainText('Pas du tracé');
  expect((await s()).step).toBe(1);
  for (const p of [{ x: 0.3, y: 0.2 }, { x: 5.6, y: 0.1 }, { x: 5.8, y: 4.3 }, { x: 0.2, y: 3.7 }]) await clickPlan(page, p);
  await clickPlan(page, { x: 0, y: 0 });
  const d = await doc(page);
  expect(d.floor.points.map((p: P) => [p.x, p.y])).toEqual([[0, 0], [6, 0], [6, 4], [0, 4]]);
  // Les autres outils passent à 10 cm
  await page.locator('[data-tool="mobilier"]').click();
  expect((await s()).step).toBeCloseTo(0.1, 5);
  // Réglage depuis la vue 3D : 50 cm pour les éléments
  await page.keyboard.press('Escape');
  await page.locator('button[data-view="3d"]').click();
  await page.locator('.fbar').filter({ hasText: 'Murs abaissés' }).getByLabel('Pas de l’aimantation').selectOption('0.5');
  expect((await s())).toMatchObject({ step: 0.5, stepOther: 0.5, stepSol: 1 });
  // Retour au sol : on retrouve 1 m ; réglé à 10 cm, il est gardé
  await page.locator('[data-tool="sol"]').click();
  expect((await s()).step).toBe(1);
  await page.locator('button[data-view="2d"]').click();
  await page.locator('.fbar').filter({ hasText: 'Grille' }).getByLabel('Pas de l’aimantation').selectOption('0.1');
  await page.locator('[data-tool="murs"]').click();
  expect((await s()).step).toBe(0.5);
  await page.locator('[data-tool="sol"]').click();
  expect((await s()).step).toBeCloseTo(0.1, 5);
});
