/**
 * Camera screen: live front-camera preview, a 3-second countdown before each
 * shot, exactly PHOTO_COUNT sequential photos, per-photo thumbnails and a
 * single retake of the whole set, then it stores the un-mirrored data URLs and
 * advances to the frame step.
 *
 * Mirroring rule (authoritative): the live <video> preview is mirrored via CSS
 * `transform: scaleX(-1)` so it feels natural, but useCamera.capture() grabs
 * UN-mirrored pixels so text printed on frames reads correctly.
 *
 * Error handling: if the camera is denied/unavailable, the user sees clear
 * instructions for enabling it in Safari plus retry and back-to-welcome paths,
 * so no one gets stuck here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';
import { useCamera } from '../../hooks/useCamera';
import type { CapturedPhoto } from '../../types';

/** Number of photos captured per session. Authoritative decision: exactly 4. */
const PHOTO_COUNT = 4;

/** Countdown length (seconds) shown before each shot. */
const COUNTDOWN_SECONDS = 3;

/**
 * Strip layout grid constants. The default is a vertical photo strip holding
 * all PHOTO_COUNT photos in a single column. To switch to a classic 2-column
 * booth strip set STRIP_COLUMNS = 2 and STRIP_ROWS = PHOTO_COUNT / 2.
 * These are consumed by the canvas compositor (utils/compositePhoto).
 */
export const STRIP_COLUMNS = 1; // vertical strip: 1 column
export const STRIP_ROWS = PHOTO_COUNT; // ...with PHOTO_COUNT rows

type Phase = 'idle' | 'countdown' | 'done';

function CameraScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const setPhotos = useKioskStore((s) => s.setPhotos);

  const { videoRef, ready, error, start, stop, capture } = useCamera();

  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [photos, setLocalPhotos] = useState<CapturedPhoto[]>([]);
  const [retakeUsed, setRetakeUsed] = useState(false);

  // Keep a live ref of photos so the countdown effect reads a stable length.
  const photosRef = useRef<CapturedPhoto[]>([]);
  photosRef.current = photos;

  // Start the camera on mount; stop it on unmount.
  useEffect(() => {
    void start();
    return () => stop();
  }, [start, stop]);

  /** Grab one un-mirrored frame and append it to the local set. */
  const takeShot = useCallback(
    (index: number) => {
      const dataUrl = capture('image/jpeg', 0.95);
      if (!dataUrl) return;
      setLocalPhotos((prev) => [
        ...prev,
        { id: `photo-${Date.now()}-${index}`, dataUrl, takenAt: Date.now() },
      ]);
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
    // Countdown reached zero: capture the next shot.
    const nextIndex = photosRef.current.length;
    takeShot(nextIndex);
    if (nextIndex + 1 < PHOTO_COUNT) {
      setCount(COUNTDOWN_SECONDS); // continue to the next shot
    } else {
      setPhase('done');
    }
    return undefined;
  }, [phase, count, takeShot]);

  const startSession = () => {
    setLocalPhotos([]);
    setCount(COUNTDOWN_SECONDS);
    setPhase('countdown');
  };

  const retake = () => {
    setRetakeUsed(true);
    setLocalPhotos([]);
    setCount(COUNTDOWN_SECONDS);
    setPhase('countdown');
  };

  const proceed = () => {
    setPhotos(photos);
    goTo('frame');
  };

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
      {/* Big centered landscape live-preview area */}
      <div className="relative flex w-full max-w-5xl flex-1 items-center justify-center overflow-hidden rounded-3xl bg-primary-900 shadow-xl">
        {/* Mirrored live preview; captured frames stay un-mirrored. */}
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
          <p className="absolute text-touch text-white/80">
            Siap berfoto? Tekan mulai!
          </p>
        )}
        {phase === 'countdown' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30">
            <span className="text-[8rem] font-extrabold text-white drop-shadow-lg">
              {count === 0 ? '📸' : count}
            </span>
            <span className="text-touch text-white/90">
              Foto {Math.min(photos.length + 1, PHOTO_COUNT)} dari {PHOTO_COUNT}
            </span>
          </div>
        )}
      </div>

      {/* Thumbnails of captured photos */}
      <div className="flex items-center gap-3">
        {Array.from({ length: PHOTO_COUNT }).map((_, i) => {
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
      <div className="flex items-center gap-4">
        {phase === 'idle' && (
          <BigButton variant="primary" disabled={!ready} onClick={startSession}>
            Mulai Foto
          </BigButton>
        )}
        {phase === 'done' && (
          <>
            {!retakeUsed && (
              <BigButton variant="secondary" onClick={retake}>
                Ulangi (1x)
              </BigButton>
            )}
            <BigButton variant="primary" onClick={proceed}>
              Lanjut Pilih Frame
            </BigButton>
          </>
        )}
        {/* Always offer an escape back to welcome so no one gets stuck. */}
        <BigButton variant="danger" onClick={reset}>
          Batal
        </BigButton>
      </div>
    </div>
  );
}

export default CameraScreen;
