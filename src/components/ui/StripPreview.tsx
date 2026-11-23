/**
 * StripPreview: a live, WYSIWYG preview of the final photo strip, rendered with
 * plain DOM (not canvas) so it can update in real time as photos are taken.
 *
 * It lays out one box per frame slot using the slot's resolution-independent
 * 0..1 coordinates (x, y, width, height) over the frame artwork, exactly like
 * FrameScreen's representative preview and the real compositePhoto output. Each
 * filled slot shows its captured photo with object-fit: cover plus the slot's
 * admin-defined zoom + offset, mirroring the drawSlotImage math so what the
 * customer sees here matches the exported image. Empty slots show a numbered
 * placeholder.
 *
 * Captured photos are already UN-mirrored (useCamera.capture un-mirrors), so no
 * CSS flip is applied here.
 *
 * Fallback: a frame without slots renders an evenly-spaced vertical strip so
 * legacy frames never crash or look empty.
 */
import type { CapturedPhoto, FrameAsset } from '../../types';

type StripPreviewProps = {
  /** The selected frame whose artwork + slots drive the layout (nullable). */
  frame: FrameAsset | null;
  /** Captured photos in slot order; index i fills slot i. Sparse allowed. */
  photos: (CapturedPhoto | undefined)[];
  /** Number of slots/photos when the frame has no explicit slot definitions. */
  fallbackCount: number;
};

/** One placeholder/photo box positioned by 0..1 slot coordinates. */
type Box = {
  key: string;
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

/**
 * CSS object-position + scale that approximate drawSlotImage's cover + zoom +
 * pan. object-fit: cover already centres and crops; zoom scales up and the
 * offset nudges the focal point. Offsets are in slot-relative units (roughly
 * -1..1) matching the compositor, so we map them onto object-position percent.
 */
function photoTransform(zoom: number, offsetX: number, offsetY: number) {
  const z = zoom > 0 ? zoom : 1;
  // Map offset (-1..1) to object-position (0%..100%); 0 => centre (50%).
  const posX = Math.min(100, Math.max(0, 50 - offsetX * 50));
  const posY = Math.min(100, Math.max(0, 50 - offsetY * 50));
  return {
    objectPosition: `${posX}% ${posY}%`,
    transform: `scale(${z})`,
    transformOrigin: `${posX}% ${posY}%`,
  } as const;
}

function StripPreview({ frame, photos, fallbackCount }: StripPreviewProps) {
  const slots = frame?.slots ?? [];
  const hasSlots = slots.length > 0;

  let boxes: Box[];
  if (hasSlots) {
    boxes = slots.map((slot, i) => ({
      key: slot.id ?? `slot-${i}`,
      leftPct: slot.x * 100,
      topPct: slot.y * 100,
      widthPct: slot.width * 100,
      heightPct: slot.height * 100,
      zoom: slot.zoom,
      offsetX: slot.offsetX,
      offsetY: slot.offsetY,
    }));
  } else {
    // Even vertical strip fallback (mirrors FrameScreen's slot-less layout).
    const count = Math.max(1, fallbackCount);
    const margin = 4; // percent outer margin
    const gutter = 3; // percent gap between slots
    const totalGutter = gutter * (count - 1);
    const slotHeight = (100 - margin * 2 - totalGutter) / count;
    boxes = Array.from({ length: count }, (_, i) => ({
      key: `fallback-${i}`,
      leftPct: margin,
      topPct: margin + i * (slotHeight + gutter),
      widthPct: 100 - margin * 2,
      heightPct: slotHeight,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    }));
  }

  return (
    <div className="flex h-full flex-col items-center gap-3">
      <span className="text-base font-semibold text-primary-700">Strip Kamu</span>
      {/* The frame <img> sets the natural aspect ratio; slot boxes overlay it in
          the same 0..1 coordinate space. */}
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <div className="relative h-full max-h-full w-auto overflow-hidden rounded-2xl border-4 border-primary-200 bg-white shadow-card">
          {/* Slot boxes sit BELOW the frame overlay. */}
          <div className="absolute inset-0">
            {boxes.map((box, i) => {
              const photo = photos[i];
              return (
                <div
                  key={box.key}
                  className="absolute overflow-hidden rounded-md bg-primary-100"
                  style={{
                    left: `${box.leftPct}%`,
                    top: `${box.topPct}%`,
                    width: `${box.widthPct}%`,
                    height: `${box.heightPct}%`,
                  }}
                >
                  {photo ? (
                    <img
                      src={photo.dataUrl}
                      alt={`Foto ${i + 1}`}
                      className="h-full w-full object-cover"
                      style={photoTransform(box.zoom, box.offsetX, box.offsetY)}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-base font-semibold text-primary-300">
                      {i + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {/* Frame PNG on top so transparent holes reveal the photos beneath. */}
          {frame && (
            <img
              src={frame.src}
              alt={`Frame ${frame.name}`}
              className="relative block h-full w-auto max-w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default StripPreview;
