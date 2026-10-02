/**
 * Camera screen (UI shell).
 *
 * This feature builds the structure and flow; the real getUserMedia camera
 * hook, mirrored live preview and un-mirrored capture are wired in FEAT-003 at
 * the clearly-marked seams below (see `CAMERA SEAM`). For now the live preview
 * area is a placeholder and "capture" produces a lightweight placeholder photo
 * so the countdown / preview / retake flow can be exercised and type-checked.
 *
 * Flow: a 3-second countdown precedes each of PHOTO_COUNT sequential shots.
 * Each captured photo gets a thumbnail. The user may retake the whole set once.
 * After PHOTO_COUNT photos the user proceeds to the frame step.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';
import type { CapturedPhoto } from '../../types';

/** Number of photos captured per session. Authoritative decision: exactly 4. */
const PHOTO_COUNT = 4;

/** Countdown length (seconds) shown before each shot. */
const COUNTDOWN_SECONDS = 3;

/**
 * Strip layout grid constants. The default is a vertical photo strip holding
 * all PHOTO_COUNT photos in a single column. To switch to a classic 2-column
 * booth strip set STRIP_COLUMNS = 2 and STRIP_ROWS = PHOTO_COUNT / 2.
 * These are consumed by the canvas compositor (FEAT-003).
 */
export const STRIP_COLUMNS = 1; // vertical strip: 1 column
export const STRIP_ROWS = PHOTO_COUNT; // ...with PHOTO_COUNT rows

type Phase = 'idle' | 'countdown' | 'done';

/**
 * CAMERA SEAM (FEAT-003): replace this with a real frame grab from the
 * <video> element drawn un-mirrored onto a canvas, returning a JPEG/PNG data
 * URL. For the shell we emit a tiny placeholder data URL so the flow works.
 */
function capturePlaceholderPhoto(index: number): CapturedPhoto {
  return {
    id: `photo-${Date.now()}-${index}`,
    dataUrl:
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="100%" height="100%" fill="#dbeafe"/><text x="50%" y="50%" font-size="48" fill="#2563eb" text-anchor="middle" dominant-baseline="middle">${index + 1}</text></svg>`,
      ),
    takenAt: Date.now(),
  };
}

function CameraScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const setPhotos = useKioskStore((s) => s.setPhotos);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(COUNTDOWN_SECONDS);
  const [photos, setLocalPhotos] = useState<CapturedPhoto[]>([]);
  const [retakeUsed, setRetakeUsed] = useState(false);

  /*
   * CAMERA SEAM (FEAT-003): start/stop the getUserMedia stream here with
   * facingMode "user", ideal 1920x1080 + fallback, and attach it to videoRef.
   * The live preview is shown mirrored (scaleX(-1)); captured frames stay
   * un-mirrored so frame text reads correctly.
   */

  /** Capture one placeholder photo, advancing the on-screen counter. */
  const takeShot = useCallback(
    (index: number) => {
      setLocalPhotos((prev) => [...prev, capturePlaceholderPhoto(index)]);
    },
    [],
  );

  /** Drive the per-shot countdown; captures when it hits zero. */
  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count > 0) {
      const t = window.setTimeout(() => setCount((c) => c - 1), 1000);
      return () => window.clearTimeout(t);
    }
    // Countdown reached zero: capture the next shot.
    const nextIndex = photos.length;
    takeShot(nextIndex);
    if (nextIndex + 1 < PHOTO_COUNT) {
      setCount(COUNTDOWN_SECONDS); // continue to the next shot
    } else {
      setPhase('done');
    }
    return undefined;
  }, [phase, count, photos.length, takeShot]);

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

  return (
    <div className="animate-fade-in flex h-full flex-col items-center gap-6 px-8 py-4">
      {/* Big centered landscape live-preview area */}
      <div className="relative flex w-full max-w-5xl flex-1 items-center justify-center overflow-hidden rounded-3xl bg-primary-900 shadow-xl">
        {/* CAMERA SEAM (FEAT-003): mirrored live video goes here. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
        {phase === 'idle' && (
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
          <BigButton variant="primary" onClick={startSession}>
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
