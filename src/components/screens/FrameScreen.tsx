/**
 * Frame screen: a swipeable/scrollable gallery of transparent frame overlays
 * from settings.frames. As the user selects a frame, a live canvas composite of
 * the four captured photos + the chosen frame is rendered via
 * utils/compositePhoto. The resulting high-quality data URL is stored so the
 * email step can send it as an attachment.
 */
import { useEffect, useState } from 'react';
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';
import { compositePhoto } from '../../utils/compositePhoto';

function FrameScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const frames = useKioskStore((s) => s.settings.frames);
  const selectedFrameId = useKioskStore((s) => s.selectedFrameId);
  const setFrame = useKioskStore((s) => s.setFrame);
  const setComposite = useKioskStore((s) => s.setComposite);
  const capturedPhotos = useKioskStore((s) => s.capturedPhotos);

  // Default to the first frame if none chosen yet.
  const [selected, setSelected] = useState<string | null>(
    selectedFrameId ?? frames[0]?.id ?? null,
  );
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);

  const selectedFrame = frames.find((f) => f.id === selected) ?? null;

  const hasFrames = frames.length > 0;

  useEffect(() => {
    setFrame(selected);
  }, [selected, setFrame]);

  // Rebuild the composite whenever the selection or photos change. The result
  // is both previewed and stored for the email step. Guard against setting
  // state after unmount / a newer selection via `cancelled`.
  useEffect(() => {
    if (capturedPhotos.length === 0) {
      setPreviewUrl(null);
      setComposite(null);
      return undefined;
    }
    let cancelled = false;
    setBuilding(true);
    const photoUrls = capturedPhotos.map((p) => p.dataUrl);
    compositePhoto(photoUrls, selectedFrame?.src ?? null, {
      type: 'image/jpeg',
      quality: 0.92,
    })
      .then((url) => {
        if (cancelled) return;
        setPreviewUrl(url);
        setComposite(url);
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl(null);
          setComposite(null);
        }
      })
      .finally(() => {
        if (!cancelled) setBuilding(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFrame, capturedPhotos, setComposite]);

  // Graceful empty-frames state: if the admin removed every frame the customer
  // flow must not crash (no frames[0] indexing). Show a friendly message and a
  // safe path back to welcome.
  if (!hasFrames) {
    return (
      <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-8 px-10 text-center">
        <div className="animate-pop flex max-w-xl flex-col gap-3 rounded-3xl bg-white/80 px-10 py-8 shadow-card backdrop-blur-sm">
          <span className="text-6xl">🖼️</span>
          <h2 className="text-big text-primary-700">Frame Belum Tersedia</h2>
          <p className="text-touch text-primary-700">
            Belum ada frame, minta admin untuk mengunggah dulu.
          </p>
        </div>
        <BigButton variant="danger" onClick={reset}>
          Batal
        </BigButton>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex h-full items-center justify-center gap-10 px-10">
      {/* Live composite preview */}
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-big text-primary-700">Pratinjau</h2>
        <div className="relative flex h-80 w-44 items-center justify-center overflow-hidden rounded-3xl border-4 border-primary-200 bg-white shadow-card">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Pratinjau hasil"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-touch text-primary-300">
              {building ? 'Memproses…' : 'Strip foto'}
            </div>
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
                  'min-h-touch flex w-32 shrink-0 flex-col items-center gap-2 rounded-3xl border-4 p-3 shadow-md transition-transform active:scale-95',
                  active
                    ? 'border-primary-600 bg-primary-50 shadow-glow'
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
            disabled={!selected || building}
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
