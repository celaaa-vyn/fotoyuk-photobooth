/**
 * Camera screen: live front-camera preview and a 3-second countdown before
 * EACH shot. The number of photos follows the selected frame's slot count
 * (selectedFrame.slots.length, falling back to 4 for legacy frames). After
 * every shot the user previews just that photo and chooses "Ulangi" (retake
 * only that photo, max 2x per photo) or "Lanjut" (accept and move on). When the
 * last photo is accepted the photos are stored, the final composite is built
 * from the selected frame + captured photos, and the flow advances to the
 * preview step (which in turn leads to email).
 *
 * A live strip preview sits to the RIGHT of the camera: as each photo is
 * accepted it drops into its slot in real time, so the customer sees the strip
 * fill up. The plain captured-photo thumbnails remain BELOW the camera.
 *
 * The live camera preview's aspect ratio follows the slot currently being
 * photographed (slot index = number of photos already accepted), so the framing
 * matches where the shot will land in the strip.
 *
 * Mirroring rule (authoritative): the live <video> preview is mirrored via CSS
 * `transform: scaleX(-1)` so it feels natural, but useCamera.capture() grabs
 * UN-mirrored pixels so text printed on frames reads correctly.
 *
 * Error handling: if the camera is denied/unavailable, the user sees clear
 * instructions for enabling it in Safari plus retry and back-to-welcome paths.
 * A "Batal" escape back to welcome is available in every state so no one gets
 * stuck here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import BigButton from '../ui/BigButton';
import StripPreview from '../ui/StripPreview';
import { useKioskStore } from '../../store/useKioskStore';
import { useCamera } from '../../hooks/useCamera';
import {
  compositePhoto,
  STRIP_WIDTH,
  STRIP_HEIGHT,
} from '../../utils/compositePhoto';
import type { CapturedPhoto } from '../../types';

/** Fallback photo count for legacy frames that have no slot definitions. */
const DEFAULT_PHOTO_COUNT = 4;

/** Countdown length (seconds) shown before each shot. */
const COUNTDOWN_SECONDS = 3;

/** Maximum number of retakes allowed per individual photo. */
const MAX_RETAKES_PER_PHOTO = 2;

/**
 * Strip layout grid constants consumed by the LEGACY canvas compositor
 * (utils/compositePhoto). The default is a vertical photo strip holding four
 * photos in a single column. These stay exported for the legacy render path
 * used in PR2; the slot-based compositor arrives in PR3. The camera capture
 * loop itself uses the dynamic per-frame photo count below, NOT these.
 */
export const STRIP_COLUMNS = 1; // vertical strip: 1 column
export const STRIP_ROWS = DEFAULT_PHOTO_COUNT; // ...with 4 rows

/**
 * Capture phases:
 *  - idle      : waiting for the user to start the session
 *  - countdown : 3s countdown running before the current (re)capture
 *  - review    : previewing the just-captured photo (Ulangi / Lanjut)
 *  - done       : all photos accepted, building composite + advancing
 */
type Phase = 'idle' | 'countdown' | 'review' | 'done';

function CameraScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const setPhotos = useKioskStore((s) => s.setPhotos);
  const setComposite = useKioskStore((s) => s.setComposite);
  const frames = useKioskStore((s) => s.settings.frames);
  const selectedFrameId = useKioskStore((s) => s.selectedFrameId);

  const selectedFrame = frames.find((f) => f.id === selectedFrameId) ?? null;
  // Photo count follows the selected frame's slots; fall back to 4.
  const photoCount = selectedFrame?.slots?.length ?? DEFAULT_PHOTO_COUNT;

  const { videoRef, ready, error, start, stop, capture } = useCamera();

  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [photos, setLocalPhotos] = useState<CapturedPhoto[]>([]);
  // Index of the photo currently being captured / reviewed (0-based).
  const [activeIndex, setActiveIndex] = useState(0);
  // Retake count per photo index (how many times that photo was redone).
  const [retakes, setRetakes] = useState<number[]>([]);
  const [building, setBuilding] = useState(false);

  // Keep live refs so the countdown effect reads stable values.
  const activeIndexRef = useRef(0);
  activeIndexRef.current = activeIndex;

  // Start the camera on mount; stop it on unmount.
  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  /**
   * Grab one un-mirrored frame and store it at `index`, replacing any existing
   * photo at that slot (used for retakes).
   */
  const takeShot = useCallback(
    (index: number) => {
      const dataUrl = capture('image/jpeg', 0.95);
      if (!dataUrl) return;
      setLocalPhotos((prev) => {
        const next = [...prev];
        next[index] = {
          id: `photo-${Date.now()}-${index}`,
          dataUrl,
          takenAt: Date.now(),
        };
        return next;
      });
    },
    [capture],
  );

  /** Drive the per-shot countdown; captures when it hits zero. */
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count > 0) {
      const t = window.setTimeout(() => setCount((c) => c - 1), 1000);
      return () => window.clearTimeout(t);
    }
    // Countdown reached zero: capture the active shot, then review it.
    takeShot(activeIndexRef.current);
    setPhase('review');
    return undefined;
  }, [phase, count, takeShot]);

  /** Begin the whole session from the first photo. */
  const startSession = () => {
    setLocalPhotos([]);
    setRetakes(Array.from({ length: photoCount }, () => 0));
    setActiveIndex(0);
    setCount(COUNTDOWN_SECONDS);
    setPhase('countdown');
  };

  /** Retake ONLY the current photo (consumes one retake for this index). */
  const retakeCurrent = () => {
    setRetakes((prev) => {
      const next = [...prev];
      next[activeIndex] = (next[activeIndex] ?? 0) + 1;
      return next;
    });
    setCount(COUNTDOWN_SECONDS);
    setPhase('countdown');
  };

  /** Accept the current photo and advance (or finish if it was the last). */
  const acceptCurrent = () => {
    const next = activeIndex + 1;
    if (next < photoCount) {
      setActiveIndex(next);
      setCount(COUNTDOWN_SECONDS);
      setPhase('countdown');
    } else {
      setPhase('done');
    }
  };

  /**
   * Finish: store the captured photos, build the final composite from the
   * selected frame + photos, and advance to the PREVIEW step so the customer
   * can confirm the result before entering their email. The composite is stored
   * once here and reused by both PreviewScreen and EmailScreen. If compositing
   * fails we still advance (with a null composite); the downstream guards steer
   * the user back rather than sending an empty image.
   */
  const proceed = async () => {
    setBuilding(true);
    setPhotos(photos);
    const photoUrls = photos.map((p) => p.dataUrl);
    try {
      const url = await compositePhoto(
        photoUrls,
        selectedFrame?.src ?? null,
        { type: 'image/jpeg', quality: 0.92 },
        selectedFrame?.slots,
      );
      setComposite(url);
    } catch {
      setComposite(null);
    } finally {
      setBuilding(false);
      goTo('preview');
    }
  };

  const currentPhoto = photos[activeIndex];
  const currentRetakes = retakes[activeIndex] ?? 0;
  const canRetake = currentRetakes < MAX_RETAKES_PER_PHOTO;

  /**
   * Aspect ratio of the live preview follows the slot currently being shot
   * (slot index = activeIndex). A slot's pixel size on the final canvas is
   * (width * STRIP_WIDTH) by (height * STRIP_HEIGHT), so we feed that ratio to
   * the preview box via CSS `aspect-ratio`. The video stays object-cover so it
   * crops to the slot ratio instead of distorting. Frames without slots fall
   * back to a sensible default (the legacy strip cell ratio) so nothing breaks.
   */
  const activeSlot = selectedFrame?.slots?.[activeIndex];
  const previewAspect = activeSlot
    ? (activeSlot.width * STRIP_WIDTH) / (activeSlot.height * STRIP_HEIGHT)
    : STRIP_WIDTH / (STRIP_HEIGHT / photoCount);

  // --- Camera permission / availability error state ---------------------
  if (error) {
    return (
      <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-6 px-10 text-center">
        <h2 className="text-big text-accent-600">Kamera Tidak Bisa Diakses</h2>
        <p className="text-touch max-w-xl text-primary-700">{error.message}</p>
        {error.kind === 'permission-denied' && (
          <ol className="max-w-xl list-decimal space-y-2 text-left text-base text-primary-700">
            <li>Buka Pengaturan iPad &rarr; Safari &rarr; Kamera.</li>
            <li>Pilih &ldquo;Izinkan&rdquo; untuk situs ini.</li>
            <li>Kembali ke aplikasi, lalu tekan &ldquo;Coba Lagi&rdquo;.</li>
          </ol>
        )}
        <div className="flex gap-4">
          <BigButton variant="primary" onClick={() => void start()}>
            Coba Lagi
          </BigButton>
          <BigButton variant="danger" onClick={reset}>
            Kembali ke Beranda
          </BigButton>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex h-full flex-col items-center gap-6 px-8 py-4">
      {/* Camera (left/centre) + live strip preview (right) side by side. */}
      <div className="flex min-h-0 w-full max-w-6xl flex-1 items-stretch justify-center gap-6">
        {/* Big live-preview area. Its aspect ratio follows the active slot so
            the framing matches where this shot lands in the strip. */}
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div
            className="relative flex max-h-full max-w-full items-center justify-center overflow-hidden rounded-3xl bg-primary-900 shadow-xl"
            style={{ aspectRatio: previewAspect, height: '100%' }}
          >
            {/* Mirrored live preview; captured frames stay un-mirrored. The
                video is object-cover so it crops to the slot ratio instead of
                distorting. */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
            />
            {!ready && (
              <p className="absolute text-touch text-white/80">Menyalakan kamera…</p>
            )}
            {ready && phase === 'idle' && (
              <p className="absolute px-4 text-center text-touch text-white/80">
                Siap berfoto? Tekan mulai!
              </p>
            )}
            {phase === 'countdown' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
                <span className="text-[8rem] font-extrabold text-white drop-shadow-lg">
                  {count === 0 ? '📸' : count}
                </span>
                <span className="text-touch text-white/90">
                  Foto {activeIndex + 1} dari {photoCount}
                </span>
              </div>
            )}
            {/* Per-photo review: show just the captured photo over the preview. */}
            {phase === 'review' && currentPhoto && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70">
                <img
                  src={currentPhoto.dataUrl}
                  alt={`Pratinjau foto ${activeIndex + 1}`}
                  className="max-h-[70%] max-w-[80%] rounded-2xl object-contain shadow-xl"
                />
                <span className="text-touch text-white/90">
                  Foto {activeIndex + 1} dari {photoCount}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Live strip preview on the right: fills in real time as photos are
            accepted. This is ADDITIONAL to the plain thumbnails below. */}
        <div className="w-40 shrink-0 sm:w-48 lg:w-56">
          <StripPreview
            frame={selectedFrame}
            photos={photos}
            fallbackCount={photoCount}
          />
        </div>
      </div>

      {/* Thumbnails of captured photos (dynamic N). */}
      <div className="flex items-center gap-3">
        {Array.from({ length: photoCount }).map((_, i) => {
          const photo = photos[i];
          return (
            <div
              key={i}
              className="h-20 w-28 overflow-hidden rounded-xl border-2 border-primary-200 bg-primary-50"
            >
              {photo ? (
                <img
                  src={photo.dataUrl}
                  alt={`Foto ${i + 1}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-touch text-primary-300">
                  {i + 1}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-4">
          {phase === 'idle' && (
            <BigButton variant="primary" disabled={!ready} onClick={startSession}>
              Mulai Foto
            </BigButton>
          )}
          {phase === 'review' && (
            <>
              {canRetake && (
                <BigButton variant="secondary" onClick={retakeCurrent}>
                  Ulangi ({MAX_RETAKES_PER_PHOTO - currentRetakes}x)
                </BigButton>
              )}
              <BigButton variant="primary" onClick={acceptCurrent}>
                {activeIndex + 1 < photoCount ? 'Lanjut' : 'Selesai Foto'}
              </BigButton>
            </>
          )}
          {phase === 'done' && (
            <BigButton
              variant="primary"
              disabled={building}
              onClick={() => void proceed()}
            >
              {building ? 'Memproses…' : 'Lihat Pratinjau'}
            </BigButton>
          )}
          {/* Always offer an escape back to welcome so no one gets stuck. */}
          <BigButton variant="danger" onClick={reset}>
            Batal
          </BigButton>
        </div>
        {phase === 'review' && !canRetake && (
          <p className="text-base text-primary-500">
            Batas pengulangan foto ini sudah tercapai.
          </p>
        )}
      </div>
    </div>
  );
}

export default CameraScreen;
