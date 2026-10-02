/**
 * compositePhoto: draw the captured photos into a photo strip on an HTML
 * Canvas, overlay the selected transparent frame PNG, and export a
 * high-quality image data URL.
 *
 * The arrangement is parametric via STRIP_COLUMNS / STRIP_ROWS (re-exported
 * from CameraScreen). The default is a VERTICAL strip: 1 column x 4 rows, i.e.
 * four photos stacked top-to-bottom. Switching to a classic 2-up booth strip
 * is a one-line change at the source of the constants (STRIP_COLUMNS = 2,
 * STRIP_ROWS = PHOTO_COUNT / 2) — the grid math below adapts automatically.
 *
 * ----------------------------------------------------------------------------
 * GRID MATH
 * ----------------------------------------------------------------------------
 * The output canvas is a fixed-size strip (STRIP_WIDTH x STRIP_HEIGHT) with a
 * uniform PADDING around the edges and a GUTTER between cells. Given COLS and
 * ROWS cells:
 *
 *   usableW = STRIP_WIDTH  - 2*PADDING - (COLS - 1)*GUTTER
 *   usableH = STRIP_HEIGHT - 2*PADDING - (ROWS - 1)*GUTTER
 *   cellW   = usableW / COLS
 *   cellH   = usableH / ROWS
 *
 * Cell (r, c) — row r (0-based, top→bottom), col c (0-based, left→right):
 *   x = PADDING + c*(cellW + GUTTER)
 *   y = PADDING + r*(cellH + GUTTER)
 *
 * Photos fill their index in reading order (row-major): index = r*COLS + c.
 * Each photo is drawn with object-fit: cover semantics (centred crop) so it
 * fills its cell without distortion. The frame PNG is then stretched over the
 * whole canvas on top, so transparent cut-outs reveal the photos beneath.
 * ----------------------------------------------------------------------------
 */
import { STRIP_COLUMNS, STRIP_ROWS } from '../components/screens/CameraScreen';

/** Output strip pixel size. 2:6 aspect-ish vertical strip, high resolution. */
export const STRIP_WIDTH = 1200;
export const STRIP_HEIGHT = 3600;

/** Uniform outer padding and inter-cell gutter (device pixels). */
const PADDING = 48;
const GUTTER = 36;

/** Background colour behind the photos (shows through frame transparency). */
const BACKGROUND = '#ffffff';

export type CompositeOptions = {
  /** Export mime type. JPEG is smaller for email; PNG preserves transparency. */
  type?: 'image/jpeg' | 'image/png';
  /** JPEG quality 0..1 (ignored for PNG). */
  quality?: number;
};

/** Load an image source (data URL or path) into a decoded HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Allow drawing cross-origin frame assets to the canvas without tainting.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Gagal memuat gambar: ${src}`));
    img.src = src;
  });
}

/**
 * Draw `img` into the rectangle (dx, dy, dw, dh) using object-fit: cover
 * semantics: scale to fill the box, centre, and crop the overflow.
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
): void {
  const scale = Math.max(dw / img.width, dh / img.height);
  const sw = dw / scale; // source width to sample
  const sh = dh / scale; // source height to sample
  const sx = (img.width - sw) / 2; // centre horizontally
  const sy = (img.height - sh) / 2; // centre vertically
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Compose the captured photos + frame into a single strip image.
 *
 * @param photoDataUrls Captured photo data URLs (un-mirrored). Extra photos
 *   beyond COLS*ROWS are ignored; missing cells are left as background.
 * @param frameSrc      Transparent frame PNG path/data URL, or null for none.
 * @returns             A data URL of the composited strip.
 */
export async function compositePhoto(
  photoDataUrls: string[],
  frameSrc: string | null,
  options: CompositeOptions = {},
): Promise<string> {
  const { type = 'image/jpeg', quality = 0.92 } = options;

  const canvas = document.createElement('canvas');
  canvas.width = STRIP_WIDTH;
  canvas.height = STRIP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');

  // Opaque background (JPEG has no alpha; PNG keeps it where the frame cuts out).
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);

  const cols = STRIP_COLUMNS;
  const rows = STRIP_ROWS;

  // Grid math (see header comment).
  const usableW = STRIP_WIDTH - 2 * PADDING - (cols - 1) * GUTTER;
  const usableH = STRIP_HEIGHT - 2 * PADDING - (rows - 1) * GUTTER;
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  // Decode only the photos that fit the grid.
  const capacity = cols * rows;
  const sources = photoDataUrls.slice(0, capacity);
  const images = await Promise.all(sources.map(loadImage));

  images.forEach((img, index) => {
    const r = Math.floor(index / cols); // row (reading order)
    const c = index % cols; // column
    const x = PADDING + c * (cellW + GUTTER);
    const y = PADDING + r * (cellH + GUTTER);
    drawCover(ctx, img, x, y, cellW, cellH);
  });

  // Overlay the transparent frame on top, stretched to the full strip.
  if (frameSrc) {
    try {
      const frame = await loadImage(frameSrc);
      ctx.drawImage(frame, 0, 0, STRIP_WIDTH, STRIP_HEIGHT);
    } catch {
      /* A missing/broken frame should not fail the whole composite — the
         photos alone are still a valid result. */
    }
  }

  return canvas.toDataURL(type, quality);
}

export default compositePhoto;
