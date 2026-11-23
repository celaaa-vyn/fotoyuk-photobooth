/**
 * SlotFrameView: the SINGLE shared way to render a frame PNG with its photo
 * slots overlaid, so the customer-facing previews are pixel-for-pixel
 * consistent with the admin Frame Editor and with the real compositePhoto
 * output (WYSIWYG).
 *
 * ----------------------------------------------------------------------------
 * COORDINATE MODEL (must match FrameEditor + compositePhoto exactly)
 * ----------------------------------------------------------------------------
 * Slots are stored in resolution-independent 0..1 units relative to the FRAME
 * ARTWORK (see FrameSlot). For the overlay to line up with the artwork, the box
 * that defines the 0..1 coordinate space must be EXACTLY the box the frame
 * image occupies, with no letterboxing and no border/padding offset.
 *
 * We achieve that the same way the Frame Editor stage does:
 *   - The coordinate box (`stageClassName`) has `aspectRatio` = the frame
 *     image's natural width/height. Because the box ratio equals the image
 *     ratio, the image fills it with NO letterboxing.
 *   - The frame image is positioned `inset-0 h-full w-full object-contain`
 *     inside that box (object-contain, like the editor backdrop, so sub-pixel
 *     rounding of the aspect-ratio box never stretches the artwork).
 *   - Each slot is positioned `absolute` with left/top/width/height =
 *     slot.(x,y,width,height) * 100% of that SAME box.
 *   - Any decorative border/rounding/shadow also lives on this box, but a
 *     border does not shift the slot origin because `absolute` children are
 *     positioned against the padding box and there is no padding; the border
 *     grows the box OUTWARD. To be safe against future padding we keep padding
 *     at 0 on the stage.
 *
 * Until the frame image loads we fall back to the legacy strip ratio
 * (1200/3600) so there is no layout jump for the common vertical-strip frames.
 *
 * Slot CONTENT is provided by the caller via `renderSlot(index, slot)` (a
 * captured photo, a numbered placeholder, etc.). Photos should use object-fit:
 * cover + the slot's zoom/offset to approximate drawSlotImage; the critical
 * guarantee this component makes is that the slot BOX position and size are
 * correct and identical everywhere.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { FrameAsset, FrameSlot } from '../../types';

/** Legacy vertical-strip ratio used before the frame image reports its size. */
const FALLBACK_ASPECT = 1200 / 3600;

type SlotFrameViewProps = {
  /** The frame whose artwork + slots drive the layout (nullable). */
  frame: FrameAsset | null;
  /** Number of evenly-spaced vertical slots to show for slot-less frames. */
  fallbackCount: number;
  /**
   * Render the content for slot `index` (0-based). The returned node fills the
   * slot box exactly (the box already handles position/size and clips
   * overflow). `slot` is the slot definition for explicit-slot frames, or a
   * synthesized fallback slot for legacy frames.
   */
  renderSlot: (index: number, slot: FrameSlot) => ReactNode;
  /**
   * Classes applied to the STAGE (the aspect-ratio coordinate box). Use this to
   * size/bound the preview and to add the decorative border/rounding/shadow.
   * Size the stage along a SINGLE axis (width, e.g. `w-full max-w-[18rem]`, OR
   * height, e.g. `h-full max-h-full w-auto`) and let `aspectRatio` drive the
   * other axis. Do NOT combine `max-h` + `max-w` + `w-auto` on this box: with
   * neither axis given a definite size the ratio can break and the frame
   * artwork stretches. Do NOT add padding here.
   */
  stageClassName?: string;
};

/**
 * Build evenly-spaced single-column fallback slots (0..1 units) for frames that
 * carry no explicit slot definitions. Mirrors the proportions used elsewhere so
 * legacy frames never look empty or crash.
 */
function fallbackSlots(count: number): FrameSlot[] {
  const n = Math.max(1, count);
  const margin = 0.04; // outer margin as a fraction
  const gutter = 0.03; // gap between slots as a fraction
  const totalGutter = gutter * (n - 1);
  const slotHeight = (1 - margin * 2 - totalGutter) / n;
  return Array.from({ length: n }, (_, i) => ({
    id: `fallback-${i}`,
    x: margin,
    y: margin + i * (slotHeight + gutter),
    width: 1 - margin * 2,
    height: slotHeight,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  }));
}

function SlotFrameView({
  frame,
  fallbackCount,
  renderSlot,
  stageClassName = '',
}: SlotFrameViewProps) {
  // Measure the frame artwork so the coordinate box matches its aspect ratio
  // exactly (no letterboxing). Fall back to the strip ratio until it loads.
  const [aspect, setAspect] = useState(FALLBACK_ASPECT);

  useEffect(() => {
    if (!frame?.src) {
      setAspect(FALLBACK_ASPECT);
      return;
    }
    let alive = true;
    const img = new Image();
    img.onload = () => {
      if (!alive) return;
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        setAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = frame.src;
    return () => {
      alive = false;
    };
  }, [frame?.src]);

  const slots =
    frame?.slots && frame.slots.length > 0
      ? frame.slots
      : fallbackSlots(fallbackCount);

  return (
    // STAGE = coordinate box: ratio = frame artwork ratio, so the image fills it
    // with no letterboxing and slots (percent of this box) align to the artwork.
    // Border/rounding/shadow sizing come from stageClassName; no padding here.
    <div
      className={['relative overflow-hidden', stageClassName]
        .filter(Boolean)
        .join(' ')}
      style={{ aspectRatio: String(aspect) }}
    >
      {/* Slot content sits BELOW the frame overlay. */}
      {slots.map((slot, i) => (
        <div
          key={slot.id ?? `slot-${i}`}
          className="absolute overflow-hidden rounded-md"
          style={{
            left: `${slot.x * 100}%`,
            top: `${slot.y * 100}%`,
            width: `${slot.width * 100}%`,
            height: `${slot.height * 100}%`,
          }}
        >
          {renderSlot(i, slot)}
        </div>
      ))}

      {/* Frame PNG overlaid ON TOP, filling the same coordinate box so its
          transparent cut-outs reveal the slot content beneath. */}
      {frame && (
        <img
          src={frame.src}
          alt={`Frame ${frame.name}`}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />
      )}
    </div>
  );
}

export default SlotFrameView;
