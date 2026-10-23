/**
 * compositePhoto: draw the captured photos into a frame on an HTML Canvas,
 * overlay the selected transparent frame PNG, and export a high-quality image
 * data URL.
 *
 * ----------------------------------------------------------------------------
 * TWO RENDER PATHS
 * ----------------------------------------------------------------------------
 * 1. SLOT-BASED (primary, "Option Y"): when the frame carries an explicit
 *    `slots[]` list (defined visually by the admin in the Frame Editor), each
 *    captured photo i is drawn into slot i. Slots are stored in
 *    resolution-independent 0..1 units relative to the frame artwork, so the
 *    output canvas size is derived from the frame PNG's natural dimensions and
 *    the slot rectangle is simply slot.(x,y,width,height) * canvas.(w,h). Inside
 *    each slot the photo is drawn with object-fit: cover, then the admin's
 *    per-slot `zoom` (tighter crop) and `offsetX/offsetY` (pan) are applied, and
 *    the draw is CLIPPED to the slot rectangle so a photo can never bleed into
 *    its neighbour. The frame PNG is overlaid on top so its transparent cut-outs
 *    reveal the photos beneath. The customer never adjusts any of this: the
 *    layout is purely the admin-defined configuration.
 *
 * 2. LEGACY STRIP (fallback): frames WITHOUT slots (older persisted uploads)
 *    fall back to the original parametric grid (STRIP_COLUMNS x STRIP_ROWS on a
 *    fixed STRIP_WIDTH x STRIP_HEIGHT canvas) so pre-existing frames still
 *    composite without any migration.
 *
 * Mirroring rule (authoritative): captured photos are already un-mirrored, and
 * this function does not flip them, so printed text on frames reads correctly.
 * Output is a high-quality JPEG by default (smaller for email).
 * ----------------------------------------------------------------------------
 */
import { STRIP_COLUMNS, STRIP_ROWS } from '../components/screens/CameraScreen';
import type { FrameSlot } from '../types';

/** Output strip pixel size for the LEGACY path. Vertical strip, high resolution. */
export const STRIP_WIDTH = 1200;
export const STRIP_HEIGHT = 3600;

/** Uniform outer padding and inter-cell gutter (device pixels) for LEGACY path. */
const PADDING = 48;
const GUTTER = 36;

/**
 * Fallback output size for the SLOT path when the frame image's natural size is
 * unavailable (e.g. a broken frame src). Keeps the same proportions as the
 * legacy strip so default slots still land sensibly.
 */
const SLOT_FALLBACK_WIDTH = STRIP_WIDTH;
const SLOT_FALLBACK_HEIGHT = STRIP_HEIGHT;

/** Background colour behind the photos (shows through frame transparency). */
const BACKGROUND = '#ffffff';

export type CompositeOptions = {
  /** Export mime type. JPEG is smaller for email; PNG preserves transparency. */
  type?: 'image/jpeg' | 'image/png';
  /** JPEG quality 0..1 (ignored for PNG). */
  quality?: number;
};

/** Load an image source (data URL or path) into a decoded HTMLImageElement. */
export function loadImage(src: string): Promise<HTMLImageElement> {
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
 * Draw one source image into a slot rectangle (already in DEVICE PIXELS) using
 * object-fit: cover, then apply the slot's `zoom` (tighter crop => zoom in) and
 * `offsetX/offsetY` pan (in slot-relative units, roughly -1..1), CLIPPED to the
 * slot box so the photo cannot bleed outside it.
 *
 * This is the single source of truth for slot rendering: both the final
 * compositor and the admin editor's live preview call it, so the editor is
 * WYSIWYG with the exported image.
 */
export function drawSlotImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  imgW: number,
  imgH: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  slot: Pick<FrameSlot, 'zoom' | 'offsetX' | 'offsetY'>,
): void {
  if (dw <= 0 || dh <= 0 || imgW <= 0 || imgH <= 0) return;

  const zoom = slot.zoom > 0 ? slot.zoom : 1;

  // Base object-fit: cover sample size for the slot box.
  const coverScale = Math.max(dw / imgW, dh / imgH);
  // Applying zoom tightens the crop: sample a smaller 1/zoom region.
  const scale = coverScale * zoom;
  const sw = dw / scale; // source width to sample
  const sh = dh / scale; // source height to sample

  // Centre, then pan. offset is expressed in slot-relative units: an offset of
  // 1 shifts the sample by one slot-width/height worth of source pixels. The
  // sample stays clamped inside the source so we never sample out of bounds.
  const maxSx = imgW - sw;
  const maxSy = imgH - sh;
  let sx = (imgW - sw) / 2 - slot.offsetX * sw;
  let sy = (imgH - sh) / 2 - slot.offsetY * sh;
  sx = Math.min(Math.max(sx, 0), Math.max(maxSx, 0));
  sy = Math.min(Math.max(sy, 0), Math.max(maxSy, 0));

  ctx.save();
  ctx.beginPath();
  ctx.rect(dx, dy, dw, dh);
  ctx.clip();
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
  ctx.restore();
}

/** True when a frame carries at least one usable slot definition. */
function hasSlots(slots: FrameSlot[] | undefined): slots is FrameSlot[] {
  return Array.isArray(slots) && slots.length > 0;
}

/**
 * SLOT-BASED render path. Derives the canvas size from the loaded frame image so
 * slots (in 0..1 units) align exactly with the artwork.
 */
async function compositeSlots(
  photoDataUrls: string[],
  frameSrc: string | null,
  slots: FrameSlot[],
  options: CompositeOptions,
): Promise<string> {
  const { type = 'image/jpeg', quality = 0.92 } = options;

  // Try to derive canvas size + overlay from the frame artwork.
  let frame: HTMLImageElement | null = null;
  if (frameSrc) {
    try {
      frame = await loadImage(frameSrc);
    } catch {
      frame = null;
    }
  }

  const width = frame?.naturalWidth || SLOT_FALLBACK_WIDTH;
  const height = frame?.naturalHeight || SLOT_FALLBACK_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);

  // Decode only as many photos as there are slots.
  const sources = photoDataUrls.slice(0, slots.length);
  const images = await Promise.all(sources.map(loadImage));

  slots.forEach((slot, index) => {
    const img = images[index];
    if (!img) return; // missing photo for this slot: leave background
    const dx = slot.x * width;
    const dy = slot.y * height;
    const dw = slot.width * width;
    const dh = slot.height * height;
    drawSlotImage(ctx, img, img.width, img.height, dx, dy, dw, dh, slot);
  });

  // Overlay the frame artwork on top at its natural size.
  if (frame) {
    ctx.drawImage(frame, 0, 0, width, height);
  }

  return canvas.toDataURL(type, quality);
}

/**
 * LEGACY strip render path (parametric COLS x ROWS grid on a fixed canvas).
 * Used only for frames that have no slot definitions.
 */
async function compositeLegacyStrip(
  photoDataUrls: string[],
  frameSrc: string | null,
  options: CompositeOptions,
): Promise<string> {
  const { type = 'image/jpeg', quality = 0.92 } = options;

  const canvas = document.createElement('canvas');
  canvas.width = STRIP_WIDTH;
  canvas.height = STRIP_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia.');

  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, STRIP_WIDTH, STRIP_HEIGHT);

  const cols = STRIP_COLUMNS;
  const rows = STRIP_ROWS;

  const usableW = STRIP_WIDTH - 2 * PADDING - (cols - 1) * GUTTER;
  const usableH = STRIP_HEIGHT - 2 * PADDING - (rows - 1) * GUTTER;
  const cellW = usableW / cols;
  const cellH = usableH / rows;

  const capacity = cols * rows;
  const sources = photoDataUrls.slice(0, capacity);
  const images = await Promise.all(sources.map(loadImage));

  images.forEach((img, index) => {
    const r = Math.floor(index / cols);
    const c = index % cols;
    const x = PADDING + c * (cellW + GUTTER);
    const y = PADDING + r * (cellH + GUTTER);
    drawCover(ctx, img, x, y, cellW, cellH);
  });

  if (frameSrc) {
    try {
      const frame = await loadImage(frameSrc);
      ctx.drawImage(frame, 0, 0, STRIP_WIDTH, STRIP_HEIGHT);
    } catch {
      /* A missing/broken frame should not fail the whole composite. */
    }
  }

  return canvas.toDataURL(type, quality);
}

/**
 * Compose the captured photos + frame into a single image.
 *
 * Picks the SLOT path when `slots` is provided and non-empty, otherwise falls
 * back to the LEGACY strip grid for backward compatibility.
 *
 * @param photoDataUrls Captured photo data URLs (un-mirrored). Extra photos
 *   beyond the slot/grid capacity are ignored; missing cells stay background.
 * @param frameSrc      Transparent frame PNG path/data URL, or null for none.
 * @param slots         Admin-defined photo slots (0..1 units). Omit/empty for
 *                      the legacy strip fallback.
 * @returns             A data URL of the composited image.
 */
export async function compositePhoto(
  photoDataUrls: string[],
  frameSrc: string | null,
  options: CompositeOptions = {},
  slots?: FrameSlot[],
): Promise<string> {
  if (hasSlots(slots)) {
    return compositeSlots(photoDataUrls, frameSrc, slots, options);
  }
  return compositeLegacyStrip(photoDataUrls, frameSrc, options);
}

export default compositePhoto;
