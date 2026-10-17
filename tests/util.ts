import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export const distUrl = (file: string) => pathToFileURL(resolve('dist', file)).href;

/** « Nouveau projet » : fenêtre de l'équipe (prénoms « Test » et première classe de la liste si rien n'est donné),
    puis « Commencer ». Avec les vrais sélecteurs de Chrome (sans faux disque), le choix du dossier est annulé. */
export async function nouveauProjet(page: import('@playwright/test').Page, champs: Record<string, string> = {}) {
  await page.getByTestId('new-project').click();
  const dlg = page.getByRole('dialog', { name: 'Nouveau projet' });
  const tout: Record<string, string> = { 'Prénoms de l’équipe': 'Test', ...champs };
  for (const [label, v] of Object.entries(tout)) if (label !== 'Classe') await dlg.getByLabel(label).fill(v);
  if (tout.Classe) await dlg.getByLabel('Classe').selectOption(tout.Classe);
  else await dlg.getByLabel('Classe').selectOption({ index: 1 });
  await page.evaluate(() => {
    const w = window as any;
    if (w.__fs) return;
    for (const f of ['showSaveFilePicker', 'showDirectoryPicker']) if (typeof w[f] === 'function') w[f] = async () => { throw new DOMException('Annulé', 'AbortError'); };
  });
  await dlg.getByRole('button', { name: /ommencer/ }).click();
}
