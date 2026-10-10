import { test, expect } from '@playwright/test';
import { distUrl } from './util';

/* Aide : visite guidée proposée à la première ouverture d'une partie, panneau de questions fréquentes, icône d'onglet. */

test.beforeEach(async ({ page }) => {
  // Sous Playwright, les propositions sont coupées par défaut : ce test les réactive.
  await page.addInitScript(() => localStorage.setItem('cs3d-visites-test', '1'));
});

test('icône de l’onglet', async ({ page }) => {
  await page.goto(distUrl('index.html'));
  await expect(page.locator('link[rel=icon]')).toHaveAttribute('href', /^data:image\/svg\+xml,/);
});

test('la visite est proposée une fois par partie, peut être refusée ou suivie jusqu’au bout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(distUrl('index.html'));
  await page.getByTestId('new-project').click();
  // Nouveau projet : les étapes du projet d'abord ; la visite attend qu'elles soient fermées.
  const steps = page.getByRole('dialog', { name: 'Étapes du projet' });
  await expect(steps).toBeVisible();
  await page.waitForTimeout(900);
  const offer = page.getByRole('dialog', { name: 'Visite guidée' });
  await expect(offer).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(steps).toBeHidden();
  await expect(offer).toContainText('Première fois dans « Surface »');
  await offer.getByRole('button', { name: 'Non merci' }).click();
  await expect(offer).toBeHidden();

  // Partie Murs : proposition, puis visite complète.
  await page.locator('[data-tool=murs]').click();
  await expect(offer).toContainText('« Murs »');
  await offer.getByRole('button', { name: 'Faire la visite' }).click();
  const bubble = page.getByRole('dialog', { name: 'Visite guidée · Murs' });
  await expect(bubble).toContainText('1 / 6');
  await expect(page.locator('.tour-spot')).toBeVisible();
  await bubble.getByRole('button', { name: 'Suivant' }).click();
  await expect(bubble).toContainText('2 / 6');
  await bubble.getByRole('button', { name: 'Précédent' }).click();
  await expect(bubble).toContainText('1 / 6');
  for (let i = 0; i < 5; i++) await bubble.getByRole('button', { name: 'Suivant' }).click();
  await bubble.getByRole('button', { name: 'Terminer' }).click();
  await expect(bubble).toBeHidden();

  // Déjà vues ou refusées : plus de proposition pour Sol et Murs, même après rechargement.
  await page.locator('[data-tool=sol]').click();
  await page.locator('[data-tool=murs]').click();
  await page.waitForTimeout(900);
  await expect(offer).toBeHidden();
  const seen = await page.evaluate(() => JSON.parse(localStorage.getItem('cs3d-visites') || '{}'));
  expect(seen).toEqual({ sol: 'refusee', murs: 'faite' });

  // « Ne plus me proposer de visites » coupe toutes les propositions.
  await page.locator('[data-tool=ouvertures]').click();
  await offer.getByRole('button', { name: 'Ne plus me proposer de visites' }).click();
  await page.locator('[data-tool=images]').click();
  await page.waitForTimeout(900);
  await expect(offer).toBeHidden();
  expect(errors).toEqual([]);
});

test('panneau Aide : la partie en cours d’abord, recherche, relance de la visite', async ({ page }) => {
  await page.goto(distUrl('index.html'));
  await page.evaluate(() => localStorage.setItem('cs3d-visites-off', '1'));
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  await page.locator('[data-tool=ouvertures]').click();

  await page.getByRole('button', { name: 'Aide' }).click();
  const help = page.getByRole('dialog', { name: 'Aide' });
  const first = help.locator('.hl-sec').first();
  await expect(first).toContainText('Portes / fenêtres');
  await expect(first).toContainText('Tu es ici');
  await first.getByText('C’est quoi l’allège ?').click();
  await expect(first).toContainText('le bas de la fenêtre');

  // Recherche sans accents ni majuscules.
  await help.getByRole('searchbox').fill('ALLEGE');
  await expect(help.locator('.hl-q')).toHaveCount(1);
  await help.getByRole('searchbox').fill('tinkercad');
  await expect(help).toContainText('Comment importer un modèle Tinkercad ?');
  await help.getByRole('searchbox').fill('xyzzy');
  await expect(help).toContainText('Aucune réponse trouvée');
  // Les touches tapées dans la recherche n'agissent pas sur la boutique.
  const n = await page.evaluate(() => (window as any).cs3d.store.doc.openings.length);
  await page.evaluate(() => (window as any).cs3d.ui.set({ sel: { kind: 'opening', id: (window as any).cs3d.store.doc.openings[0].id } }));
  await help.getByRole('searchbox').press('Delete');
  expect(await page.evaluate(() => (window as any).cs3d.store.doc.openings.length)).toBe(n);

  // Relancer la visite depuis le panneau.
  await help.getByRole('button', { name: /Visite guidée : Portes/ }).click();
  await expect(help).toBeHidden();
  const bubble = page.getByRole('dialog', { name: 'Visite guidée · Portes / fenêtres' });
  await expect(bubble).toContainText('1 / 4');
  await page.keyboard.press('Escape');
  await expect(bubble).toBeHidden();
  expect(await page.evaluate(() => (window as any).cs3d.store.doc.openings.length)).toBe(n);

  // Échap ferme le panneau ; dans l'atelier, ses propres questions passent en premier.
  await page.getByRole('button', { name: 'Aide' }).click();
  await page.keyboard.press('Escape');
  await expect(help).toBeHidden();
  await page.evaluate(() => (window as any).cs3d.ctx.openAtelier());
  await page.getByRole('button', { name: 'Aide' }).click();
  await expect(help.locator('.hl-sec').first()).toContainText('Atelier de mobilier');
});

test('chaque étape de chaque visite éclaire une zone visible', async ({ page }) => {
  await page.goto(distUrl('index.html'));
  const tour = async (part: string) => {
    await page.evaluate(p => (window as any).cs3d.startTour(p), part);
    const bubble = page.locator('.tour-bub');
    await expect(bubble).toBeVisible();
    await expect(bubble.locator('.tour-count')).toHaveText(/^1 \/ \d+$/);
    const n = Number((await bubble.locator('.tour-count').textContent())!.split('/')[1]);
    for (let i = 1; i <= n; i++) {
      await expect(bubble.locator('.tour-count')).toHaveText(`${i} / ${n}`);
      await expect(page.locator('.tour-spot'), `${part}, étape ${i}`).toBeVisible();
      // La bulle reste dans l'écran.
      const b = (await bubble.boundingBox())!;
      expect(b.x >= 0 && b.y >= 0 && b.x + b.width <= 1366 && b.y + b.height <= 768, `${part}, étape ${i}`).toBe(true);
      await bubble.getByRole('button', { name: i === n ? 'Terminer' : 'Suivant' }).click();
    }
    await expect(bubble).toBeHidden();
  };
  await tour('accueil');
  await page.getByTestId('template').click();
  await page.getByRole('button', { name: 'Boutique exemple' }).click();
  for (const tool of ['murs', 'ouvertures', 'mobilier', 'images']) {
    await page.evaluate(t => (window as any).cs3d.ui.set({ tool: t, sel: null, libraryOpen: false }), tool);
    await tour(tool);
  }
  await tour('vue3d');
  await page.evaluate(() => (window as any).cs3d.start('new'));
  await tour('sol');
  await page.evaluate(() => (window as any).cs3d.start('sample'));
  await page.evaluate(() => (window as any).cs3d.ctx.openAtelier());
  await tour('atelier');
  await page.getByRole('button', { name: 'Retour à la boutique' }).click();
  await page.getByRole('button', { name: 'Plan A3' }).click();
  await tour('plan');
});

test('étapes du projet : ouvertes au nouveau projet, cochées et gardées dans le fichier', async ({ page }) => {
  await page.goto(distUrl('index.html'));
  await page.evaluate(() => localStorage.setItem('cs3d-visites-off', '1'));
  await page.getByTestId('new-project').click();
  const steps = page.getByRole('dialog', { name: 'Étapes du projet' });
  await expect(steps).toBeVisible();
  await expect(steps).toContainText('Maquette 3D = maquette en carton');
  await expect(steps.locator('.st')).toHaveCount(7);
  await expect(steps.locator('.st.now')).toContainText('Valider le concept du magasin');
  const btn = page.locator('[data-tour=steps]');
  await expect(btn).toHaveText('Étape 1/7');
  await steps.getByRole('checkbox', { name: /Valider le concept/ }).click();
  await expect(btn).toHaveText('Étape 2/7');
  await expect(steps.locator('.st.now')).toContainText('Tracer la surface commerciale');
  // Un bouton d'étape mène au bon outil et ferme le panneau.
  await steps.locator('.st.now').getByRole('button', { name: 'Portes / fenêtres' }).click();
  await expect(steps).toBeHidden();
  expect(await page.evaluate(() => (window as any).cs3d.ui.s.tool)).toBe('ouvertures');
  expect(await page.evaluate(() => (window as any).cs3d.store.doc.steps)).toEqual(['concept']);
  // Le panneau d'aide et celui des étapes ne s'ouvrent pas l'un sur l'autre.
  await btn.click();
  await expect(steps).toBeVisible();
  await page.getByRole('button', { name: 'Aide' }).click();
  await expect(steps).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Aide' })).toBeVisible();
});
