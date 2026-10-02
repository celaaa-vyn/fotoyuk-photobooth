/**
 * Frame screen (UI shell).
 *
 * A swipeable/scrollable gallery of frame overlays from settings.frames. The
 * user picks one and sees a live preview placeholder of the composite result.
 * The real canvas compositing (captured photos + transparent PNG frame) is
 * wired in FEAT-003 at the `COMPOSITE SEAM` below.
 */
import { useEffect, useState } from 'react';
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';

function FrameScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const frames = useKioskStore((s) => s.settings.frames);
  const selectedFrameId = useKioskStore((s) => s.selectedFrameId);
  const setFrame = useKioskStore((s) => s.setFrame);
  const capturedPhotos = useKioskStore((s) => s.capturedPhotos);

  // Default to the first frame if none chosen yet.
  const [selected, setSelected] = useState<string | null>(
    selectedFrameId ?? frames[0]?.id ?? null,
  );

  useEffect(() => {
    setFrame(selected);
  }, [selected, setFrame]);

  const selectedFrame = frames.find((f) => f.id === selected) ?? null;

  return (
    <div className="animate-fade-in flex h-full items-center justify-center gap-10 px-10">
      {/* Live composite preview placeholder */}
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-big text-primary-700">Pratinjau</h2>
        <div className="relative flex h-80 w-44 items-center justify-center overflow-hidden rounded-2xl border-4 border-primary-200 bg-white shadow-xl">
          {/* COMPOSITE SEAM (FEAT-003): render the canvas composite of
              capturedPhotos arranged per STRIP_COLUMNS/STRIP_ROWS with the
              selected frame overlaid. For now, stack photo thumbnails. */}
          <div className="flex h-full w-full flex-col">
            {capturedPhotos.length > 0 ? (
              capturedPhotos.map((p) => (
                <img
                  key={p.id}
                  src={p.dataUrl}
                  alt="Foto"
                  className="w-full flex-1 object-cover"
                />
              ))
            ) : (
              <div className="flex h-full items-center justify-center text-touch text-primary-300">
                Strip foto
              </div>
            )}
          </div>
          {selectedFrame && (
            <img
              src={selectedFrame.src}
              alt={selectedFrame.name}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
          )}
        </div>
      </div>

      {/* Frame gallery */}
      <div className="flex max-w-xl flex-col gap-6">
        <h2 className="text-big text-primary-700">Pilih Frame</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {frames.map((frame) => {
            const active = frame.id === selected;
            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => setSelected(frame.id)}
                className={[
                  'min-h-touch flex w-32 shrink-0 flex-col items-center gap-2 rounded-2xl border-4 p-3 transition-transform active:scale-95',
                  active
                    ? 'border-primary-600 bg-primary-50'
                    : 'border-primary-100 bg-white',
                ].join(' ')}
              >
                <img
                  src={frame.src}
                  alt={frame.name}
                  className="h-32 w-full object-contain"
                />
                <span className="text-base font-semibold text-primary-700">
                  {frame.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-4">
          <BigButton
            variant="primary"
            disabled={!selected}
            onClick={() => goTo('email')}
          >
            Lanjut
          </BigButton>
          <BigButton variant="danger" onClick={reset}>
            Batal
          </BigButton>
        </div>
      </div>
    </div>
  );
}

export default FrameScreen;
