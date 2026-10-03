import type { ImageAsset } from '../model/types';
import { uid } from '../model/geometry';

/* Images importées par les élèves (par exemple faites sur Canva).
   PNG ou JPG, 5 Mo au plus ; réduites à 2048 px pour rester fluides sur les PC du collège.
   Une image sans transparence est réenregistrée en JPEG (fichier projet plus léger). */

export const MAX_IMAGE_MB = 5;
export const MAX_PX = 2048;

export interface ImageRead { asset: ImageAsset; bytes: number; originalW: number; originalH: number; reduced: boolean }

export async function readImageFile(f: File): Promise<ImageRead> {
  const okType = /^image\/(png|jpeg)$/.test(f.type) || /\.(png|jpe?g)$/i.test(f.name);
  if (!okType) throw new Error(`« ${f.name} » n’est pas une image PNG ou JPG.`);
  if (f.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`« ${f.name} » fait ${(f.size / 1024 / 1024).toFixed(1).replace('.', ',')} Mo. Maximum : ${MAX_IMAGE_MB} Mo.`);
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error(`« ${f.name} » est illisible.`)); i.src = url;
    });
    const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d')!;
    c.drawImage(img, 0, 0, w, h);
    const png = /png$/i.test(f.type) || /\.png$/i.test(f.name);
    const transparent = png && hasTransparency(c, w, h);
    const data = transparent ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.86);
    return { asset: { id: uid(), name: f.name, data, w, h }, bytes: f.size, originalW: img.naturalWidth, originalH: img.naturalHeight, reduced: k < 1 };
  } finally { URL.revokeObjectURL(url); }
}

function hasTransparency(c: CanvasRenderingContext2D, w: number, h: number) {
  const d = c.getImageData(0, 0, w, h).data;
  const step = Math.max(4, Math.floor((w * h) / 200000) * 4); // échantillonnage sur les grandes images
  for (let i = 3; i < d.length; i += step) if (d[i] < 250) return true;
  return false;
}

export const fmtBytes = (n: number) => n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko';
