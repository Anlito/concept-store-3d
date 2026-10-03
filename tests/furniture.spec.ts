import { test, expect, type Page } from '@playwright/test';
import { distUrl } from './util';

/* Étape 3 : bibliothèque de mobilier, placement et personnalisation des objets — en file://. */

type P = { x: number; y: number };
const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);
const sel = (page: Page) => page.evaluate(() => (window as any).cs3d.ui.s.sel);
const screen = (page: Page, p: P) => page.evaluate(q => (window as any).cs3d.editor.plan.toScreen(q), p);

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  await page.locator('button[data-view="2d"]').click();
  await page.locator('[data-tool="mobilier"]').click();
  await expect(page.getByTestId('library')).toBeVisible();
});
test.afterEach(() => expect(errors).toEqual([]));

async function placeFromLibrary(page: Page, name: string) {
  await page.locator('.fc', { hasText: name }).first().click();
  await page.getByRole('button', { name: 'Placer dans la boutique' }).click();
  await expect(page.getByTestId('library')).toBeHidden();
  const d = await doc(page);
  return d.objects[d.objects.length - 1];
}

test('la bibliothèque : catégories, recherche, miniatures et dimensions', async ({ page }) => {
  const lib = page.getByTestId('library');
  await expect(lib.locator('.lib-tab', { hasText: 'Base' })).toContainText(/\d+/);
  await lib.locator('.lib-cat', { hasText: 'Plantes' }).click();
  const cards = lib.locator('.fc');
  expect(await cards.count()).toBeGreaterThanOrEqual(5);
  // Dimensions réelles affichées et miniature calculée
  await expect(cards.first().locator('.fc-d')).toHaveText(/\d+ × \d+ cm|× \d+ × \d+ cm/);
  await expect(cards.first().locator('img')).toHaveAttribute('src', /^data:image\/png/, { timeout: 15_000 });
  // Recherche insensible à la casse, sur toute la bibliothèque si la catégorie est « Tout »
  await lib.locator('.lib-cat', { hasText: 'Tout' }).click();
  await lib.getByLabel('Rechercher un meuble').fill('COMPTOIR');
  const names = await lib.locator('.fc-n').allTextContents();
  expect(names.length).toBeGreaterThan(0);
  for (const n of names) expect(n.toLowerCase()).toContain('comptoir');
  await lib.getByLabel('Rechercher un meuble').fill('zzzz');
  await expect(lib.getByText('Aucun meuble trouvé')).toBeVisible();
  // Onglets vides pour l'instant
  await lib.locator('.lib-tab', { hasText: 'Mes créations' }).click();
  await expect(lib.getByText('Atelier')).toBeVisible();
});

test('placer un meuble, le régler au clavier, annuler', async ({ page }) => {
  const o = await placeFromLibrary(page, 'Table basse en bois');
  expect(o.model).toBe('table-basse-bois');
  expect(o.size.h).toBeCloseTo(0.4, 2);
  expect(await sel(page)).toEqual({ kind: 'objects', ids: [o.id] });
  const panel = page.getByTestId('panel');
  await expect(panel).toContainText('Table basse en bois');
  // Hauteur avec proportions conservées
  const w0 = o.size.w;
  await panel.getByLabel('Hauteur', { exact: true }).fill('80'); await panel.getByLabel('Hauteur', { exact: true }).press('Enter');
  let p = (await doc(page)).objects[0];
  expect(p.size.h).toBeCloseTo(0.8, 3);
  expect(p.size.w).toBeCloseTo(w0 * 2, 2);
  // Rotation et couleur
  await panel.getByTitle('+15° (touche R)').click();
  await page.keyboard.press('r');
  await panel.getByRole('button', { name: 'Sauge' }).click();
  p = (await doc(page)).objects[0];
  expect(p.rot).toBe(30);
  expect(p.color).toBe('#6E8B6B');
  // Annuler revient en arrière, étape par étape
  await page.keyboard.press('Control+z');
  expect((await doc(page)).objects[0].color).toBeNull();
});

test('déplacer un objet sur le plan, aimanté à la grille', async ({ page }) => {
  const o = await placeFromLibrary(page, 'Comptoir noir');
  const a = await screen(page, { x: o.x, y: o.y }), b = await screen(page, { x: o.x - 2.03, y: o.y + 1.47 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
  const p = (await doc(page)).objects[0];
  expect(p.x).toBeCloseTo(Math.round((o.x - 2.03) * 10) / 10, 5);
  expect(p.y).toBeCloseTo(Math.round((o.y + 1.47) * 10) / 10, 5);
  // Un seul Ctrl+Z annule tout le déplacement
  await page.keyboard.press('Control+z');
  const back = (await doc(page)).objects[0];
  expect([back.x, back.y]).toEqual([o.x, o.y]);
});

test('copier-coller, dupliquer, sélection multiple et suppression', async ({ page }) => {
  await placeFromLibrary(page, 'Chaise moderne');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.keyboard.press('Control+d');
  let d = await doc(page);
  expect(d.objects).toHaveLength(3);
  // Rectangle de sélection autour des trois chaises
  const xs = d.objects.map((o: any) => o.x), ys = d.objects.map((o: any) => o.y);
  await page.keyboard.press('Escape');
  const a = await screen(page, { x: Math.min(...xs) - 1, y: Math.min(...ys) - 1 }), b = await screen(page, { x: Math.max(...xs) + 1, y: Math.max(...ys) + 1 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up();
  const s = await sel(page);
  expect(s.kind).toBe('objects');
  expect(s.ids).toHaveLength(3);
  await expect(page.getByTestId('panel')).toContainText('3 objets');
  // Verrouiller puis tenter de supprimer : refusé
  await page.getByRole('button', { name: 'Verrouiller' }).click();
  await page.keyboard.press('Delete');
  expect((await doc(page)).objects).toHaveLength(3);
  await page.getByRole('button', { name: 'Déverrouiller' }).click();
  await page.keyboard.press('Delete');
  d = await doc(page);
  expect(d.objects).toHaveLength(0);
});

test('un objet mural se plaque contre le mur', async ({ page }) => {
  const o = await placeFromLibrary(page, 'Grand cadre');
  expect(o.z).toBeCloseTo(1.2, 5);
  // Collé à l'un des quatre murs de la boutique 10 × 7 m, dos au mur
  const half = o.size.d / 2;
  const nearWall = [o.y - half, 7 - o.y - half, o.x - half, 10 - o.x - half].some(v => Math.abs(v) < 0.02);
  expect(nearWall).toBe(true);
  // Glisser vers le mur du haut : il pivote face à la boutique
  const a = await screen(page, { x: o.x, y: o.y }), b = await screen(page, { x: 5, y: 0.3 });
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
  const p = (await doc(page)).objects[0];
  expect(p.rot).toBe(0);
  expect(p.y).toBeCloseTo(half + 0.005, 3);
});

test('les objets apparaissent dans la vue 3D', async ({ page }) => {
  await placeFromLibrary(page, 'Canapé');
  await page.locator('button[data-view="3d"]').click();
  await page.waitForTimeout(1500);
  const n = await page.evaluate(() => {
    const v = (window as any).cs3d.editor.view3d;
    let meshes = 0; v.objects.group.traverse((c: any) => { if (c.isMesh) meshes++; });
    return meshes;
  });
  expect(n).toBeGreaterThan(0);
  await expect(page.locator('.tag3d')).toContainText('cm');
});

test('couleur exacte avec la palette, puis réutilisable en couleur récente', async ({ page }) => {
  await page.locator('.fc', { hasText: 'Canapé design' }).first().dblclick();
  const panel = page.getByTestId('panel');
  await expect(panel.getByRole('button', { name: 'Autre couleur…' })).toBeVisible();
  await panel.locator('.sw-input').fill('#1e7f8c');
  let o = (await page.evaluate(() => (window as any).cs3d.store.doc.objects[0]));
  expect(o.color).toBe('#1E7F8C');
  // La couleur apparaît en « couleur récente », aussi pour les murs
  await page.locator('[data-tool="murs"]').click();
  const recent = page.getByTestId('panel').getByRole('button', { name: 'Couleur #1E7F8C' });
  await expect(recent).toBeVisible();
  await recent.click();
  const d = await page.evaluate(() => (window as any).cs3d.store.doc);
  expect(d.walls.styles.every((s: any) => s.color === '#1E7F8C')).toBe(true);
  o = d.objects[0];
  expect(o.color).toBe('#1E7F8C');
});
