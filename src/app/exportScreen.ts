import type { Ctx } from './state';
import { h, icon } from '../ui/dom';
import { alert, segmented, toast, toggle } from '../ui/components';
import { SCALES, bestScale, layoutSheet, planSize, type Scale } from '../export/sheet';
import { sheetPdf, sheetSvg } from '../export/render';

/* Écran « Plan A3 à imprimer » (maquette 07) : aperçu de la feuille, échelle, cartouche, téléchargement. */

const cm = (mm: number) => (mm / 10).toFixed(1).replace('.', ',').replace(/,0$/, '');

export function exportScreen(ctx: Ctx, back: () => void): HTMLElement {
  const { store } = ctx;
  const d = store.doc;
  let cotes = true;
  let scale: Scale = d.floor ? bestScale(d, cotes) : 50;
  const team = { ...d.team };

  const sheetBox = h('div', { class: 'ex-sheet' });
  const status = h('div');
  const dl = h('button', { class: 'btn btn-primary btn-xl', type: 'button', onclick: () => download() }, icon('download'), 'Télécharger le PDF');
  const perM = h('div', { class: 'p-help' });

  const scaleSeg = segmented(SCALES.map(s => ({ value: s, label: '1:' + s })), () => scale, s => { scale = s; render(); }, 'seg-lg');
  const cotesTg = toggle('Cotes des murs', 'straighten', () => cotes, v => { cotes = v; render(); });
  const field = (label: string, key: keyof typeof team, ph: string) => {
    const input = h('input', { value: team[key], placeholder: ph, 'aria-label': label, maxLength: 80 });
    input.addEventListener('input', () => { team[key] = input.value; render(); });
    input.addEventListener('change', () => store.update(doc => { doc.team[key] = input.value.trim(); }));
    input.addEventListener('keydown', e => e.stopPropagation());
    return h('label', { class: 'tf' }, label, input);
  };
  const legendRow = (dash: string, label: string) => {
    const sample = h('span', { class: 'ex-sample' });
    sample.innerHTML = `<svg width="44" height="8" viewBox="0 0 44 8"><line x1="2" y1="4" x2="42" y2="4" style="stroke:#22211F;stroke-width:2.5${dash ? ';stroke-dasharray:' + dash : ''}"/></svg>`;
    return h('div', { class: 'ex-leg' }, sample, label);
  };
  const legend = h('div', { class: 'ex-legs' },
    legendRow('', 'Murs : trait plein (les deux faces du mur)'),
    legendRow('10 5', 'Portes : tirets longs'),
    legendRow('2 2', 'Fenêtres et vitrines : pointillés'));

  const el = h('div', { class: 'ed ex', 'data-testid': 'export' },
    h('header', { class: 'tb' },
      h('div', { class: 'tb-l' },
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: back }, icon('arrow_back'), 'Retour à l’éditeur'),
        h('div', { class: 'tb-title' }, h('div', { class: 'tb-name', style: { pointerEvents: 'none' } }, 'Plan A3 à imprimer'),
          h('div', { class: 'tb-status', style: { color: 'var(--text-3)' } }, d.name))),
      h('div'), h('div')),
    h('div', { class: 'ed-body' },
      h('main', { class: 'ex-main' }, sheetBox,
        h('div', { class: 'ex-chip' }, icon('crop_landscape'), 'A3 paysage · 420 × 297 mm')),
      h('aside', { class: 'pn', style: { width: '340px' } },
        h('div', { class: 'pn-b', style: { gap: '22px' } },
          h('div', { class: 'p-sec' }, h('div', { class: 'p-sec-t' }, 'Échelle'), scaleSeg.el, perM),
          status,
          h('div', { class: 'p-sec' }, h('div', { class: 'p-sec-t' }, 'Sur la feuille'), legend, cotesTg.el),
          h('div', { class: 'p-sec' }, h('div', { class: 'p-sec-t' }, 'Équipe (cartouche)'),
            field('Nom de l’équipe', 'name', 'Les Bâtisseurs'), field('Prénoms', 'members', 'Léa, Malik, Inès, Tom'), field('Classe', 'klass', '4e B')),
          alert('info', 'Pour imprimer', 'Choisis « Taille réelle » ou « 100 % » et désactive « Ajuster à la page ». Vérifie ensuite la barre de 10 cm à la règle.')),
        h('div', { class: 'pn-f' }, dl))));

  function render() {
    scaleSeg.refresh(); cotesTg.refresh();
    const doc = store.doc;
    if (!doc.floor) {
      sheetBox.replaceChildren(h('div', { class: 'vp-empty', style: { position: 'static' } }, h('div', null, h('h2', null, 'Pas encore de sol'), h('p', null, 'Trace le sol de ta boutique pour obtenir son plan.'))));
      status.replaceChildren(); dl.disabled = true; return;
    }
    const lay = layoutSheet({ ...doc, team }, { scale, cotes, team });
    sheetBox.innerHTML = sheetSvg(lay);
    sheetBox.classList.toggle('too-big', !lay.fits);
    perM.replaceChildren('1 m dans la boutique = ', h('b', null, cm(1000 / scale) + ' cm'), ' sur la feuille');
    const size = `${cm(lay.planW)} × ${cm(lay.planH)} cm`;
    if (lay.fits) status.replaceChildren(alert('success', `Le plan tient sur la feuille : ${size}`));
    else {
      const next = SCALES.find(s => s > scale && planSize(doc, s, cotes).fits);
      const a = alert('warning', 'Boutique trop grande pour cette échelle', `Le plan mesure ${size}. La place disponible sur la feuille A3 est de 39 × 22 cm.`);
      if (next) a.querySelector('.alert-txt')!.appendChild(h('button', { class: 'alert-btn', type: 'button', onclick: () => { scale = next; render(); } }, `Passer à 1:${next}`));
      else a.querySelector('.alert-txt')!.appendChild(h('span', null, 'Même à 1:100 la boutique ne tient pas : réduis la surface au sol.'));
      status.replaceChildren(a);
    }
    dl.disabled = !lay.fits;
    dl.title = lay.fits ? '' : 'Choisis une échelle qui fait tenir le plan sur la feuille';
  }

  function download() {
    const doc = store.doc; if (!doc.floor) return;
    const lay = layoutSheet({ ...doc, team }, { scale, cotes, team });
    if (!lay.fits) return;
    const safe = (doc.name || 'boutique').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
    sheetPdf(lay, `${doc.name} · plan des murs`).save(`plan-A3-${safe || 'boutique'}-1-${scale}.pdf`);
    toast('PDF téléchargé : imprime-le en taille réelle (100 %).');
  }

  render();
  return el;
}
