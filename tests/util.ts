import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const distUrl = (file: string) => pathToFileURL(resolve('dist', file)).href;

/** « Nouveau projet » : fenêtre de l'équipe (champs facultatifs), puis « Commencer ».
    Avec les vrais sélecteurs de Chrome (sans faux disque), le choix du dossier est annulé. */
export async function nouveauProjet(page: import('@playwright/test').Page, champs: Record<string, string> = {}) {
  await page.getByTestId('new-project').click();
  const dlg = page.getByRole('dialog', { name: 'Nouveau projet' });
  for (const [label, v] of Object.entries(champs)) await dlg.getByLabel(label).fill(v);
  await page.evaluate(() => {
    const w = window as any;
    if (!w.__fs && typeof w.showSaveFilePicker === 'function') w.showSaveFilePicker = async () => { throw new DOMException('Annulé', 'AbortError'); };
  });
  await dlg.getByRole('button', { name: /ommencer/ }).click();
}
