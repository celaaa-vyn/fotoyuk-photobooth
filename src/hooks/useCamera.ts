/**
 * useCamera: front-camera access for the photobooth via getUserMedia.
 *
 * Key behaviours (authoritative decisions):
 * - Requests the FRONT camera (facingMode "user") at an ideal 1920x1080, with
 *   an automatic fallback to looser constraints if the ideal resolution is not
 *   supported by the device/browser.
 * - The live <video> preview is mirrored in the UI via CSS `transform:
 *   scaleX(-1)` (handled by the component), which feels natural to the user.
 * - CRITICAL: capture() draws the current video frame UN-mirrored onto an
 *   offscreen canvas. We never apply a horizontal flip when capturing, so any
 *   text printed later onto the frame reads correctly in the saved image.
 * - Permission-denied (and other) errors are surfaced via `error`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Discriminated camera error so the UI can show the right instructions. */
export type CameraErrorKind = 'permission-denied' | 'not-found' | 'unknown';

export type CameraError = {
  kind: CameraErrorKind;
  message: string;
};

export type UseCameraResult = {
  /** Attach to the <video> element that shows the live (mirrored) preview. */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** The active stream, or null when not started. */
  stream: MediaStream | null;
  /** True once a stream is live and the video is playing. */
  ready: boolean;
  /** Non-null when access failed; see `kind` for permission vs other errors. */
  error: CameraError | null;
  /** Request camera access and begin the preview. Safe to call repeatedly. */
  start: () => Promise<void>;
  /** Stop all tracks and release the camera. */
  stop: () => void;
  /**
   * Grab the current video frame UN-MIRRORED as a data URL. Returns null if the
   * stream is not ready. `type`/`quality` let callers trade size vs fidelity.
   */
  capture: (type?: 'image/jpeg' | 'image/png', quality?: number) => string | null;
};

/** Ideal (high-res) constraints tried first. */
const IDEAL_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  },
  audio: false,
};

/** Looser fallback used if the ideal resolution/constraints are rejected. */
const FALLBACK_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user' },
  audio: false,
};

/** Map a getUserMedia rejection to a friendly, categorised error. */
function toCameraError(err: unknown): CameraError {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      kind: 'permission-denied',
      message: 'Akses kamera ditolak. Izinkan kamera di pengaturan Safari.',
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return {
      kind: 'not-found',
      message: 'Kamera depan tidak ditemukan di perangkat ini.',
    };
  }
  return {
    kind: 'unknown',
    message: 'Tidak dapat mengakses kamera. Coba lagi.',
  };
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);

  const stop = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
    }
    streamRef.current = null;
    setStream(null);
    setReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const start = useCallback(async () => {
    // Already running: nothing to do.
    if (streamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError({
        kind: 'unknown',
        message: 'Browser ini tidak mendukung akses kamera.',
      });
      return;
    }

    setError(null);
    setReady(false);

    let media: MediaStream;
    try {
      // Try the high-res ideal constraints first.
      media = await navigator.mediaDevices.getUserMedia(IDEAL_CONSTRAINTS);
    } catch (idealErr) {
      // Permission denial is terminal — do not retry with looser constraints.
      const mapped = toCameraError(idealErr);
      if (mapped.kind === 'permission-denied') {
        setError(mapped);
        return;
      }
      // Otherwise fall back to looser constraints (e.g. OverconstrainedError).
      try {
        media = await navigator.mediaDevices.getUserMedia(FALLBACK_CONSTRAINTS);
      } catch (fallbackErr) {
        setError(toCameraError(fallbackErr));
        return;
      }
    }

    streamRef.current = media;
    setStream(media);

    const video = videoRef.current;
    if (video) {
      video.srcObject = media;
      try {
        await video.play();
      } catch {
        /* Autoplay can reject if the element isn't ready yet; the `playing`
           listener below still flips `ready` once playback starts. */
      }
    }
    setReady(true);
  }, []);

  /**
   * Draw the current frame to an offscreen canvas WITHOUT mirroring and return
   * a data URL. We intentionally do NOT flip the context horizontally here so
   * the saved pixels are un-mirrored and frame text reads correctly.
   */
  const capture = useCallback(
    (type: 'image/jpeg' | 'image/png' = 'image/jpeg', quality = 0.95): string | null => {
      const video = videoRef.current;
      if (!video || !streamRef.current) return null;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return null;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // No ctx.scale(-1, 1): draw the frame exactly as the camera sees it.
      ctx.drawImage(video, 0, 0, width, height);
      return canvas.toDataURL(type, quality);
    },
    [],
  );

  // Release the camera when the hook unmounts.
  useEffect(() => stop, [stop]);

  return { videoRef, stream, ready, error, start, stop, capture };
}

export default useCamera;
