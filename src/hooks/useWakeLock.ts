/**
 * useWakeLock: keep the iPad screen awake while the kiosk is active.
 *
 * Uses the Screen Wake Lock API (`navigator.wakeLock.request('screen')`) to
 * stop the display from dimming/sleeping during an event. The lock is:
 *
 * - acquired on mount,
 * - released on unmount,
 * - RE-ACQUIRED on `visibilitychange` when the page becomes visible again
 *   (iOS/Safari automatically drops the lock whenever the page is hidden,
 *   e.g. after a notification overlay or app switch, so we must re-request it).
 *
 * The API is still not available in every browser (and only works over HTTPS),
 * so every call is feature-detected and wrapped in try/catch — an unsupported
 * environment simply becomes a no-op with no crash and no type errors.
 *
 * We declare the WakeLock types locally because some TypeScript `lib.dom`
 * versions do not yet ship them.
 */
import { useEffect, useRef } from 'react';

// --- Minimal WakeLock typings (lib.dom may not include these) ---------------
interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
  removeEventListener: (type: 'release', listener: () => void) => void;
}

interface WakeLockLike {
  request: (type: 'screen') => Promise<WakeLockSentinelLike>;
}

/** Narrow `navigator.wakeLock` without widening the global `Navigator` type. */
function getWakeLock(): WakeLockLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  const wl = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
  return wl;
}

/**
 * Request and maintain a screen wake lock for the lifetime of the component.
 * Safe to call unconditionally — it degrades to a no-op when unsupported.
 */
export function useWakeLock(): void {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    const wakeLock = getWakeLock();
    if (!wakeLock) return; // Unsupported browser: nothing to do.

    let cancelled = false;

    const acquire = async (): Promise<void> => {
      // Only re-acquire when visible and not already holding a live lock.
      if (document.visibilityState !== 'visible') return;
      if (sentinelRef.current && !sentinelRef.current.released) return;
      try {
        const sentinel = await wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release().catch(() => undefined);
          return;
        }
        sentinelRef.current = sentinel;
        // The system can release the lock on its own; clear our ref so the
        // next visibility change re-acquires it.
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) {
            sentinelRef.current = null;
          }
        });
      } catch {
        // Denied/unsupported/called while hidden — ignore and try again later.
      }
    };

    const handleVisibility = (): void => {
      if (document.visibilityState === 'visible') {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      const current = sentinelRef.current;
      sentinelRef.current = null;
      if (current && !current.released) {
        void current.release().catch(() => undefined);
      }
    };
  }, []);
}

export default useWakeLock;
