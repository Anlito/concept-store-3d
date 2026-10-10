import type { Ctx } from './state';
import { h, icon } from '../ui/dom';
import { alert, segmented, toast, toggle } from '../ui/components';
import { SCALES, ZONE_SIZE, bestScale, layoutSheet, planSize, scaleInfo, type Scale } from '../export/sheet';
import { sheetPdf, sheetSvg } from '../export/render';
import { helpButton, offerTour } from './guide/guide';
import { TEAM_FOLDER, saveBlob } from './files';
import { markStep } from './guide/steps';

/* Écran « Plan A3 à imprimer » (maquette 07) : aperçu de la feuille, échelle, cartouche, téléchargement. */

const cm = (mm: number) => (mm / 10).toFixed(1).replace('.', ',').replace(/,0$/, '');

export function exportScreen(ctx: Ctx, back: () => void): HTMLElement {
  const { store } = ctx;
  const d = store.doc;
  let cotes = true;
  let scale: Scale = d.floor ? bestScale(d, cotes) : 30;
  const team = { ...d.team };

  const sheetBox = h('div', { class: 'ex-sheet' });
  const status = h('div');
  const dl = h('button', { class: 'btn btn-primary btn-xl', type: 'button', onclick: () => void download() }, icon('download'), 'Enregistrer le PDF');
  const cartouche = h('div');
  const inputs = new Map<string, HTMLInputElement>();
  const perM = h('div', { class: 'p-help' });

  const scaleSeg = segmented(SCALES.map(s => ({ value: s.k as Scale, label: s.label })), () => scale, s => { scale = s; render(); }, 'seg-lg');
  const cotesTg = toggle('Cotes des murs', 'straighten', () => cotes, v => { cotes = v; render(); });
  const field = (label: string, key: keyof typeof team, ph: string) => {
    const input = h('input', { value: team[key], placeholder: ph, 'aria-label': label, maxLength: 80, required: true });
    inputs.set(key, input);
    input.addEventListener('input', () => { team[key] = input.value; render(); });
    input.addEventListener('change', () => store.update(doc => { doc.team[key] = input.value.trim(); }));
    input.addEventListener('keydown', e => e.stopPropagation());
    return h('label', { class: 'tf' }, h('span', null, label, h('span', { class: 'req', title: 'Obligatoire' }, ' *')), input);
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
      h('div'), h('div', { class: 'tb-r' }, helpButton())),
    h('div', { class: 'ed-body' },
      h('main', { class: 'ex-main' }, sheetBox,
        h('div', { class: 'ex-chip' }, icon('crop_landscape'), 'A3 paysage · 420 × 297 mm')),
      h('aside', { class: 'pn', style: { width: '340px' } },
        h('div', { class: 'pn-b', style: { gap: '22px' } },
          h('div', { class: 'p-sec', 'data-tour': 'ex-scale' }, h('div', { class: 'p-sec-t' }, 'Échelle'), scaleSeg.el, perM),
          status,
          h('div', { class: 'p-sec' }, h('div', { class: 'p-sec-t' }, 'Sur la feuille'), legend, cotesTg.el),
          h('div', { class: 'p-sec', 'data-tour': 'ex-team' }, h('div', { class: 'p-sec-t' }, 'Équipe (cartouche)'),
            field('Nom de l’équipe', 'name', 'Les Bâtisseurs'), field('Prénoms', 'members', 'Léa, Malik, Inès, Tom'), field('Classe', 'klass', '4e B'), cartouche),
          alert('info', 'Pour imprimer', 'Choisis « Taille réelle » ou « 100 % » et désactive « Ajuster à la page ». Vérifie ensuite à la règle la longueur de la barre d’échelle, écrite à côté d’elle.')),
        h('div', { class: 'pn-f' }, h('div', { class: 'ex-where' }, icon('folder_open'), h('span', null, 'À enregistrer dans le dossier de ton équipe : ', h('b', null, TEAM_FOLDER))), dl))));

  function render() {
    scaleSeg.refresh(); cotesTg.refresh();
    const doc = store.doc;
    if (!doc.floor) {
      sheetBox.replaceChildren(h('div', { class: 'vp-empty', style: { position: 'static' } }, h('div', null, h('h2', null, 'Pas encore de surface'), h('p', null, 'Trace la surface de ta boutique pour obtenir son plan.'))));
      status.replaceChildren(); dl.disabled = true; return;
    }
    const lay = layoutSheet({ ...doc, team }, { scale, cotes, team });
    sheetBox.innerHTML = sheetSvg(lay);
    sheetBox.classList.toggle('too-big', !lay.fits);
    perM.replaceChildren('1 m dans la boutique = ', h('b', null, cm(scale) + ' cm'), ' sur la feuille (', scaleInfo(scale).ratio, ')', lay.rotated ? ' · plan tourné d’un quart de tour pour tenir sur la feuille' : '');
    const size = `${cm(lay.planW)} × ${cm(lay.planH)} cm`;
    if (lay.fits) status.replaceChildren(alert('success', `Le plan tient sur la feuille : ${size}`));
    else {
      const next = SCALES.find(s => s.k < scale && planSize(doc, s.k, cotes).fits);
      const fitsWithoutCotes = cotes && planSize(doc, scale, false).fits;
      const a = alert('warning', 'Boutique trop grande pour cette échelle', `Le plan mesure ${size}. La place disponible sur la feuille A3 est de ${cm(ZONE_SIZE.w)} × ${cm(ZONE_SIZE.h)} cm.`);
      const box = a.querySelector('.alert-txt')!;
      if (fitsWithoutCotes) box.appendChild(h('button', { class: 'alert-btn', type: 'button', onclick: () => { cotes = false; render(); } }, 'Masquer les cotes'));
      if (next) box.appendChild(h('button', { class: 'alert-btn', type: 'button', onclick: () => { scale = next.k; render(); } }, `Passer à ${next.label}`));
      if (!next && !fitsWithoutCotes) box.appendChild(h('span', null, 'La boutique ne tient pas sur la feuille : réduis la surface au sol.'));
      status.replaceChildren(a);
    }
    // Cartouche obligatoire : nom de l'équipe, prénoms, classe.
    const missing = (['name', 'members', 'klass'] as const).filter(k => !team[k].trim());
    for (const [k, input] of inputs) input.classList.toggle('missing', missing.includes(k as typeof missing[number]));
    cartouche.replaceChildren(...(missing.length ? [alert('warning', 'Cartouche à compléter', 'Le nom de l’équipe, les prénoms et la classe sont obligatoires pour enregistrer le plan.')] : []));
    dl.disabled = !lay.fits || missing.length > 0;
    dl.title = !lay.fits ? 'Choisis une échelle qui fait tenir le plan sur la feuille' : missing.length ? 'Remplis d’abord le cartouche' : '';
  }

  async function download() {
    const doc = store.doc; if (!doc.floor) return;
    const lay = layoutSheet({ ...doc, team }, { scale, cotes, team });
    if (!lay.fits || !team.name.trim() || !team.members.trim() || !team.klass.trim()) return;
    store.update(d => { d.team = { name: team.name.trim(), members: team.members.trim(), klass: team.klass.trim() }; });
    // Nom proposé : « Plan-A3-Prenom-Prenom.pdf », comme le dossier de l'équipe.
    const who = team.members.normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-zA-Z0-9]+/).filter(Boolean)
      .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('-');
    const blob = sheetPdf(lay, `${doc.name} · plan des murs`).output('blob');
    try {
      const name = await saveBlob(`Plan-A3-${who || 'equipe'}.pdf`, blob, { description: 'Plan A3 (PDF)', accept: { 'application/pdf': ['.pdf'] } });
      if (!name) return; // explorateur fermé sans enregistrer
      markStep(ctx, 'plan');
      toast(`Plan enregistré : « ${name} ». Imprime-le en A3, taille réelle (100 %).`);
    } catch {
      toast('Impossible d’enregistrer ici : choisis le dossier de ton équipe.', undefined, 'warning');
    }
  }

  render();
  offerTour('plan');
  return el;
}
