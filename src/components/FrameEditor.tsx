/**
 * FrameEditor: the visual slot editor used inside the admin panel (Option Y).
 *
 * The admin defines, per frame, WHERE each customer photo lands and HOW it is
 * cropped. Slots are stored in resolution-independent 0..1 units relative to the
 * frame artwork (see FrameSlot). The admin:
 *   - sets the number of slots (stepper),
 *   - drags each slot to position it and resizes it with a corner handle,
 *   - fine-tunes x/y/width/height (%) and per-slot zoom + pan with numeric
 *     inputs / sliders,
 * all over a live backdrop of the frame PNG. A WYSIWYG live preview (a <canvas>)
 * fills every slot with a coloured dummy photo transformed exactly like the real
 * compositor (drawSlotImage), with the frame overlaid, so what the admin sees is
 * what the customer gets. The CUSTOMER never sees any of this: at runtime the
 * saved slots are applied automatically in compositePhoto.
 *
 * Touch: dragging and resizing use POINTER events with touch-action: none on the
 * handles so it works on iPad without the browser hijacking the gesture for
 * scroll/zoom.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import BigButton from './ui/BigButton';
import { drawSlotImage, loadImage } from '../utils/compositePhoto';
import type { FrameSlot } from '../types';

/** Minimum slot edge length in 0..1 units (keeps handles grabbable). */
const MIN_SIZE = 0.05;

/** Distinct, high-contrast colours for the dummy placeholder photos. */
const DUMMY_COLORS = [
  '#2563eb',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#0ea5e9',
  '#84cc16',
];

type Props = {
  /** Frame PNG path or data URL used as the editing backdrop + overlay. */
  frameSrc: string;
  /** Display name of the frame being edited (header text). */
  frameName: string;
  /** Initial slots (may be empty for a brand-new frame). */
  initialSlots: FrameSlot[];
  /** Save the edited slots back to the store. */
  onSave: (slots: FrameSlot[]) => void;
  /** Dismiss without saving. */
  onCancel: () => void;
};

/** A reasonable default slot: centred, ~40% of each axis, neutral crop. */
function makeDefaultSlot(index: number): FrameSlot {
  return {
    id: `slot-${index}`,
    x: 0.3,
    y: 0.3,
    width: 0.4,
    height: 0.4,
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };
}

/** Clamp n into [min, max]. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * Build a coloured dummy photo (labelled with the slot number) as an offscreen
 * canvas we can feed to drawSlotImage for the WYSIWYG preview.
 */
function makeDummyPhoto(index: number, label: number): HTMLCanvasElement {
  const size = 600;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const base = DUMMY_COLORS[index % DUMMY_COLORS.length];
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    // Diagonal stripes so pan/zoom is visible against a plain fill.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 24;
    for (let i = -size; i < size * 2; i += 80) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + size, size);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 260px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(label), size / 2, size / 2);
  }
  return c;
}

type DragState =
  | { kind: 'move'; slotId: string; startX: number; startY: number; origX: number; origY: number }
  | {
      kind: 'resize';
      slotId: string;
      startX: number;
      startY: number;
      origW: number;
      origH: number;
    }
  | null;

function FrameEditor({ frameSrc, frameName, initialSlots, onSave, onCancel }: Props) {
  const [slots, setSlots] = useState<FrameSlot[]>(
    initialSlots.length > 0 ? initialSlots : [makeDefaultSlot(0)],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSlots[0]?.id ?? 'slot-0',
  );

  // Frame artwork aspect ratio (width / height). Defaults to the legacy strip
  // ratio until the image loads.
  const [aspect, setAspect] = useState(1200 / 3600);
  const [frameImg, setFrameImg] = useState<HTMLImageElement | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragRef = useRef<DragState>(null);

  // Measured pixel size of the editing stage (for px <-> 0..1 conversion).
  const [stageSize, setStageSize] = useState({ width: 1, height: 1 });

  // Dummy photos, regenerated when the slot count changes.
  const dummyPhotos = useMemo(
    () => slots.map((_, i) => makeDummyPhoto(i, i + 1)),
    [slots.length],
  );

  // Load the frame artwork once for aspect + overlay.
  useEffect(() => {
    let alive = true;
    loadImage(frameSrc)
      .then((img) => {
        if (!alive) return;
        setFrameImg(img);
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          setAspect(img.naturalWidth / img.naturalHeight);
        }
      })
      .catch(() => {
        /* Broken frame src: keep the default aspect and skip the overlay. */
      });
    return () => {
      alive = false;
    };
  }, [frameSrc]);

  // Measure the stage so pointer deltas convert to 0..1 units accurately.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setStageSize({ width: r.width || 1, height: r.height || 1 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selectedSlot = slots.find((s) => s.id === selectedId) ?? null;

  const patchSlot = useCallback((id: string, patch: Partial<FrameSlot>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  // --- slot count -------------------------------------------------------
  const addSlot = () => {
    setSlots((prev) => {
      const next = [...prev, makeDefaultSlot(prev.length)];
      setSelectedId(next[next.length - 1].id);
      return next;
    });
  };

  const removeSlot = () => {
    setSlots((prev) => {
      if (prev.length <= 1) return prev; // keep at least one slot
      const next = prev.slice(0, -1);
      setSelectedId((cur) =>
        cur && next.some((s) => s.id === cur) ? cur : next[next.length - 1].id,
      );
      return next;
    });
  };

  // --- drag + resize (pointer events) -----------------------------------
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dxPx = e.clientX - drag.startX;
      const dyPx = e.clientY - drag.startY;
      const dx = dxPx / stageSize.width;
      const dy = dyPx / stageSize.height;

      setSlots((prev) =>
        prev.map((s) => {
          if (s.id !== drag.slotId) return s;
          if (drag.kind === 'move') {
            const x = clamp(drag.origX + dx, 0, 1 - s.width);
            const y = clamp(drag.origY + dy, 0, 1 - s.height);
            return { ...s, x, y };
          }
          // resize from the bottom-right corner
          const width = clamp(drag.origW + dx, MIN_SIZE, 1 - s.x);
          const height = clamp(drag.origH + dy, MIN_SIZE, 1 - s.y);
          return { ...s, width, height };
        }),
      );
    },
    [stageSize.width, stageSize.height],
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  }, [onPointerMove]);

  const beginDrag = (
    e: React.PointerEvent,
    slot: FrameSlot,
    kind: 'move' | 'resize',
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(slot.id);
    dragRef.current =
      kind === 'move'
        ? {
            kind: 'move',
            slotId: slot.id,
            startX: e.clientX,
            startY: e.clientY,
            origX: slot.x,
            origY: slot.y,
          }
        : {
            kind: 'resize',
            slotId: slot.id,
            startX: e.clientX,
            startY: e.clientY,
            origW: slot.width,
            origH: slot.height,
          };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  };

  // Clean up listeners if the editor unmounts mid-drag.
  useEffect(() => endDrag, [endDrag]);

  // --- live WYSIWYG preview ---------------------------------------------
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    // Render at a modest resolution matching the frame aspect.
    const width = 500;
    const height = Math.round(width / (aspect || 1));
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    slots.forEach((slot, i) => {
      const dummy = dummyPhotos[i];
      if (!dummy) return;
      drawSlotImage(
        ctx,
        dummy,
        dummy.width,
        dummy.height,
        slot.x * width,
        slot.y * height,
        slot.width * width,
        slot.height * height,
        slot,
      );
    });

    if (frameImg) {
      ctx.drawImage(frameImg, 0, 0, width, height);
    }
  }, [slots, dummyPhotos, frameImg, aspect]);

  const handleSave = () => {
    // Re-id slots sequentially so ids stay stable + ordered on save.
    const normalized = slots.map((s, i) => ({ ...s, id: `slot-${i}` }));
    onSave(normalized);
  };

  const pct = (n: number) => Math.round(n * 100);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-full w-full max-w-5xl flex-col gap-4 overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-touch font-bold text-primary-700">
            Atur Slot: {frameName}
          </h2>
          <span className="rounded-full bg-primary-100 px-4 py-1 text-base font-semibold text-primary-700">
            {slots.length} slot
          </span>
        </div>

        <p className="text-base text-primary-600">
          Seret kotak untuk memindahkan, tarik pojok kanan bawah untuk mengubah
          ukuran. Atur zoom dan geser foto di tiap slot. Tamu tidak mengatur apa
          pun, posisi ini dipakai otomatis.
        </p>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Editing stage: frame backdrop + draggable slot rectangles. */}
          <div className="flex flex-col items-center gap-3">
            <h3 className="self-start text-base font-bold text-primary-700">
              Editor
            </h3>
            <div
              ref={stageRef}
              className="relative mx-auto w-full max-w-[18rem] touch-none select-none overflow-hidden rounded-2xl border-4 border-primary-200 bg-primary-50"
              style={{ aspectRatio: String(aspect) }}
            >
              {/* Frame artwork backdrop (dimmed so slots read clearly). */}
              <img
                src={frameSrc}
                alt={`Backdrop frame ${frameName}`}
                className="pointer-events-none absolute inset-0 h-full w-full object-contain opacity-60"
                draggable={false}
              />
              {slots.map((slot, i) => {
                const active = slot.id === selectedId;
                return (
                  <div
                    key={slot.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => beginDrag(e, slot, 'move')}
                    className={[
                      'absolute flex items-center justify-center rounded-md border-2 text-base font-bold',
                      active
                        ? 'border-primary-600 bg-primary-500/30 text-primary-800'
                        : 'border-primary-400/70 bg-primary-300/20 text-primary-700',
                    ].join(' ')}
                    style={{
                      left: `${slot.x * 100}%`,
                      top: `${slot.y * 100}%`,
                      width: `${slot.width * 100}%`,
                      height: `${slot.height * 100}%`,
                      touchAction: 'none',
                      cursor: 'move',
                    }}
                  >
                    {i + 1}
                    {/* Corner resize handle. */}
                    <span
                      onPointerDown={(e) => beginDrag(e, slot, 'resize')}
                      className="absolute -bottom-2 -right-2 h-7 w-7 rounded-full border-2 border-white bg-primary-600 shadow-md"
                      style={{ touchAction: 'none', cursor: 'nwse-resize' }}
                    />
                  </div>
                );
              })}
            </div>

            {/* Slot count stepper. */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={removeSlot}
                disabled={slots.length <= 1}
                className="min-h-touch min-w-touch rounded-2xl bg-primary-100 text-touch font-bold text-primary-700 shadow-sm transition-transform active:scale-95 disabled:opacity-40"
              >
                −
              </button>
              <span className="text-touch font-bold text-primary-700">
                {slots.length}
              </span>
              <button
                type="button"
                onClick={addSlot}
                className="min-h-touch min-w-touch rounded-2xl bg-primary-600 text-touch font-bold text-white shadow-md transition-transform active:scale-95"
              >
                +
              </button>
            </div>
          </div>

          {/* Live WYSIWYG preview with dummy photos. */}
          <div className="flex flex-col items-center gap-3">
            <h3 className="self-start text-base font-bold text-primary-700">
              Pratinjau Langsung
            </h3>
            <canvas
              ref={previewCanvasRef}
              className="mx-auto w-full max-w-[18rem] rounded-2xl border-4 border-primary-200 bg-white shadow-md"
            />
            <p className="text-center text-sm text-primary-500">
              Foto contoh berwarna mengikuti posisi, zoom, dan geseran slot.
            </p>
          </div>
        </div>

        {/* Per-slot numeric fine-tuning + zoom/pan. */}
        {selectedSlot && (
          <div className="flex flex-col gap-3 rounded-2xl bg-primary-50 p-4">
            <h3 className="text-base font-bold text-primary-700">
              Slot {slots.findIndex((s) => s.id === selectedSlot.id) + 1} dipilih
            </h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <NumberField
                label="X (%)"
                value={pct(selectedSlot.x)}
                min={0}
                max={100}
                onChange={(v) =>
                  patchSlot(selectedSlot.id, {
                    x: clamp(v / 100, 0, 1 - selectedSlot.width),
                  })
                }
              />
              <NumberField
                label="Y (%)"
                value={pct(selectedSlot.y)}
                min={0}
                max={100}
                onChange={(v) =>
                  patchSlot(selectedSlot.id, {
                    y: clamp(v / 100, 0, 1 - selectedSlot.height),
                  })
                }
              />
              <NumberField
                label="Lebar (%)"
                value={pct(selectedSlot.width)}
                min={5}
                max={100}
                onChange={(v) =>
                  patchSlot(selectedSlot.id, {
                    width: clamp(v / 100, MIN_SIZE, 1 - selectedSlot.x),
                  })
                }
              />
              <NumberField
                label="Tinggi (%)"
                value={pct(selectedSlot.height)}
                min={5}
                max={100}
                onChange={(v) =>
                  patchSlot(selectedSlot.id, {
                    height: clamp(v / 100, MIN_SIZE, 1 - selectedSlot.y),
                  })
                }
              />
            </div>

            {/* Zoom + pan sliders. */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <SliderField
                label={`Zoom ${selectedSlot.zoom.toFixed(2)}x`}
                value={selectedSlot.zoom}
                min={1}
                max={3}
                step={0.05}
                onChange={(v) => patchSlot(selectedSlot.id, { zoom: v })}
              />
              <SliderField
                label={`Geser X ${selectedSlot.offsetX.toFixed(2)}`}
                value={selectedSlot.offsetX}
                min={-1}
                max={1}
                step={0.05}
                onChange={(v) => patchSlot(selectedSlot.id, { offsetX: v })}
              />
              <SliderField
                label={`Geser Y ${selectedSlot.offsetY.toFixed(2)}`}
                value={selectedSlot.offsetY}
                min={-1}
                max={1}
                step={0.05}
                onChange={(v) => patchSlot(selectedSlot.id, { offsetY: v })}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-4">
          <BigButton variant="secondary" onClick={onCancel}>
            Batal
          </BigButton>
          <BigButton variant="primary" onClick={handleSave}>
            Simpan Slot
          </BigButton>
        </div>
      </div>
    </div>
  );
}

type NumberFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
};

function NumberField({ label, value, min, max, onChange }: NumberFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-primary-700">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="min-h-[44px] rounded-xl border-2 border-primary-200 px-3 text-base focus:border-primary-500 focus:outline-none"
      />
    </label>
  );
}

type SliderFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

function SliderField({ label, value, min, max, step, onChange }: SliderFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-sm font-semibold text-primary-700">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full accent-primary-600"
        style={{ touchAction: 'none' }}
      />
    </label>
  );
}

export default FrameEditor;
