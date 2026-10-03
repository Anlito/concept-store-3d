import { test, expect, type Page } from '@playwright/test';
import { distUrl } from './util';

/* Façade (revêtement extérieur, décor de rue, images côté rue) et styles de portes, fenêtres, vitrines. */

const doc = (page: Page) => page.evaluate(() => (window as any).cs3d.store.doc);
const ui = (page: Page) => page.evaluate(() => (window as any).cs3d.ui.s);

let errors: string[];
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('index.html'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click(); // 10 × 7 m, vitrines et porte sur le mur n° 3
});
test.afterEach(() => expect(errors).toEqual([]));

test('revêtement de façade, indépendant de l’intérieur', async ({ page }) => {
  await page.locator('[data-tool="murs"]').click();
  await page.getByTestId('panel').getByRole('button', { name: 'Façade', exact: true }).click();
  expect((await ui(page)).cutaway).toBe(false); // on voit la façade
  await page.evaluate(() => (window as any).cs3d.ui.set({ sel: { kind: 'wall', index: 2 } }));
  await page.getByRole('button', { name: 'Pierre' }).click();
  let d = await doc(page);
  expect(d.walls.styles[2]).toMatchObject({ material: 'peinture', outMaterial: 'pierre' });
  expect(d.walls.styles[0].outMaterial).toBeUndefined();
  await page.getByRole('button', { name: 'Bardage bois' }).click();
  await page.getByTestId('panel').getByRole('button', { name: 'Vert sapin' }).click();
  d = await doc(page);
  expect(d.walls.styles[2]).toMatchObject({ outMaterial: 'bardage', outColor: '#3F5E4A', material: 'peinture' });
  // Retour à l'intérieur : les réglages ne touchent plus la façade
  await page.getByRole('button', { name: 'Intérieur', exact: true }).click();
  await page.getByRole('button', { name: 'Brique' }).click();
  d = await doc(page);
  expect(d.walls.styles[2]).toMatchObject({ material: 'brique', outMaterial: 'bardage' });
});

test('styles et couleurs des portes, fenêtres et vitrines', async ({ page }) => {
  await page.locator('[data-tool="ouvertures"]').click();
  const id = await page.evaluate(() => (window as any).cs3d.store.doc.openings.find((o: any) => o.type === 'porte' && o.wall === 2).id);
  await page.evaluate(i => (window as any).cs3d.ui.set({ sel: { kind: 'opening', id: i } }), id);
  const panel = page.getByTestId('panel');
  await panel.getByRole('button', { name: 'Double vitrée' }).click();
  await panel.getByRole('button', { name: 'Noyer' }).click();
  let o = (await doc(page)).openings.find((x: any) => x.id === id);
  expect(o).toMatchObject({ style: 'double', color: '#8A5A3B' });
  await panel.getByRole('button', { name: 'Couleur du style' }).click();
  o = (await doc(page)).openings.find((x: any) => x.id === id);
  expect(o.color).toBeUndefined();
  // Changer de type remet le style par défaut
  await panel.getByRole('button', { name: 'Vitrine', exact: true }).click();
  await panel.getByRole('button', { name: 'Atelier' }).click();
  o = (await doc(page)).openings.find((x: any) => x.id === id);
  expect(o).toMatchObject({ type: 'vitrine', style: 'atelier' });
  // Style choisi avant de poser une fenêtre
  await page.keyboard.press('Escape');
  await panel.getByRole('button', { name: 'Fenêtre', exact: true }).click();
  await panel.getByRole('button', { name: 'Fixe' }).click();
  const before = (await doc(page)).openings.length;
  await page.locator('button[data-view="2d"]').click();
  const p = await page.evaluate(() => (window as any).cs3d.editor.plan.toScreen({ x: 10.05, y: 3.5 }));
  await page.mouse.click(p.x, p.y);
  const d = await doc(page);
  expect(d.openings.length).toBe(before + 1);
  expect(d.openings.at(-1)).toMatchObject({ type: 'fenetre', style: 'fixe' });
});

test('décor extérieur : catégorie « Extérieur », objets de façade côté rue', async ({ page }) => {
  await page.locator('[data-tool="mobilier"]').click();
  const lib = page.getByTestId('library');
  await lib.locator('.lib-cat', { hasText: 'Extérieur' }).click();
  await expect(lib.locator('.fc')).toHaveCount(5);
  await lib.locator('.fc', { hasText: 'Store banne' }).dblclick();
  let d = await doc(page);
  const store = d.objects[0];
  // Collé à l'extérieur du mur de la rue (y = 7 + 10 cm d'épaisseur), face à la rue, au-dessus de la porte
  expect(store.y - store.size.d / 2).toBeCloseTo(7.1 + 0.005, 2);
  expect(store.rot).toBe(0);
  expect(store.z).toBeCloseTo(2.3, 5);
  // Un cadre glissé dehors, contre la façade, s'y accroche face à la rue
  await page.evaluate(() => (window as any).cs3d.ui.set({ libraryOpen: true }));
  await lib.locator('.lib-cat', { hasText: 'Décor' }).click();
  await lib.locator('.fc', { hasText: 'Grand cadre' }).dblclick();
  const frame = (await doc(page)).objects[1];
  await page.locator('button[data-view="2d"]').click();
  const a2 = await page.evaluate(q => (window as any).cs3d.editor.plan.toScreen(q), { x: frame.x, y: frame.y });
  const b = await page.evaluate(() => (window as any).cs3d.editor.plan.toScreen({ x: 8.5, y: 7.3 }));
  await page.mouse.move(a2.x, a2.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  d = await doc(page);
  const f2 = d.objects[1];
  expect(f2.y).toBeGreaterThan(7.1);
  expect(f2.rot).toBe(0); // face à la rue (+y)
});

test('image côté rue et bouton « Façade » de la vue 3D', async ({ page }) => {
  await page.locator('[data-tool="images"]').click();
  await page.getByRole('button', { name: 'Ajouter une image' }).click();
  const dlg = page.getByTestId('image-dialog');
  const fc = page.waitForEvent('filechooser');
  await dlg.getByRole('button', { name: 'Choisir une image' }).click();
  await (await fc).setFiles('tests/fixtures/soldes.png');
  await dlg.getByRole('button', { name: 'Vitrine', exact: true }).click();
  await dlg.getByLabel('Mur', { exact: true }).selectOption({ index: 2 });
  await dlg.getByRole('button', { name: 'Façade (rue)' }).click();
  await dlg.getByRole('button', { name: 'Placer l’image' }).click();
  expect((await doc(page)).images[0]).toMatchObject({ target: 'vitrine', wall: 2, side: 'ext' });
  await page.evaluate(() => (window as any).cs3d.ui.set({ cutaway: true }));
  await page.locator('.fbar').getByRole('button', { name: 'Façade', exact: true }).click();
  expect((await ui(page)).cutaway).toBe(false);
});
