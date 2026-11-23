/**
 * StripPreview: a live, WYSIWYG preview of the final photo strip, rendered with
 * plain DOM (not canvas) so it can update in real time as photos are taken.
 *
 * It delegates the frame + slot LAYOUT to the shared SlotFrameView, which is the
 * exact same coordinate model used by the admin Frame Editor and FrameScreen and
 * which matches the real compositePhoto output. StripPreview only decides what
 * goes INSIDE each slot box: a captured photo (object-fit: cover plus the slot's
 * admin-defined zoom + offset, approximating drawSlotImage) or a numbered
 * placeholder.
 *
 * Captured photos are already mirrored once by useCamera.capture (to match the
 * live preview), so NO additional CSS flip is applied here (that would
 * double-mirror them).
 */
import type { CapturedPhoto, FrameAsset } from '../../types';
import SlotFrameView from './SlotFrameView';

type StripPreviewProps = {
  /** The selected frame whose artwork + slots drive the layout (nullable). */
  frame: FrameAsset | null;
  /** Captured photos in slot order; index i fills slot i. Sparse allowed. */
  photos: (CapturedPhoto | undefined)[];
  /** Number of slots/photos when the frame has no explicit slot definitions. */
  fallbackCount: number;
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
  return (
    <div className="flex h-full flex-col items-center gap-3">
      <span className="text-base font-semibold text-primary-700">Strip Kamu</span>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <SlotFrameView
          frame={frame}
          fallbackCount={fallbackCount}
          stageClassName="h-full max-h-full w-auto rounded-2xl border-4 border-primary-200 bg-white shadow-card"
          renderSlot={(i, slot) => {
            const photo = photos[i];
            if (!photo) {
              return (
                <div className="flex h-full w-full items-center justify-center bg-primary-100 text-base font-semibold text-primary-300">
                  {i + 1}
                </div>
              );
            }
            return (
              <img
                src={photo.dataUrl}
                alt={`Foto ${i + 1}`}
                className="h-full w-full bg-primary-100 object-cover"
                style={photoTransform(slot.zoom, slot.offsetX, slot.offsetY)}
              />
            );
          }}
        />
      </div>
    </div>
  );
}

export default StripPreview;
