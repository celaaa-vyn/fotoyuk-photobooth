/**
 * useEmailQueue: offline-tolerant email delivery.
 *
 * The queue lives in the Zustand store (persisted to localStorage via the
 * store's enqueueEmail/dequeueEmail/updateQueuedEmail actions). This hook:
 *
 * - Exposes `send(...)` which tries an immediate send when online, and on
 *   failure OR when offline enqueues the email for later retry. It can also
 *   mark/record the associated transaction's email status.
 * - Registers a window 'online' listener that flushes the queue by retrying
 *   each pending email; successful ones are dequeued, failures stay queued
 *   with an incremented attempt count + last error.
 * - Exposes the current queue size so the UI can reflect pending sends.
 *
 * The RESEND_API_KEY never touches the client — sends always go through the
 * /api/send-email serverless function (see utils/email.ts).
 */
import { useCallback, useEffect, useRef } from 'react';
import { useKioskStore } from '../store/useKioskStore';
import { sendEmail } from '../utils/email';
import type { QueuedEmail } from '../types';

/** Generate a reasonably-unique id for queue items. */
function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type QueueSendParams = {
  to: string;
  /** Final composite image as a data URL or raw base64. */
  imageDataUrl: string;
  filename: string;
  /** Associated transaction id so its status can be updated later. */
  transactionId?: string | null;
};

export type QueueSendResult = {
  /** True if the email was delivered immediately. */
  sent: boolean;
  /** True if it was placed on the queue for later retry. */
  queued: boolean;
  /** Error detail when the immediate send failed. */
  error?: string;
};

export type UseEmailQueueResult = {
  /** Number of emails currently waiting to be sent. */
  queueSize: number;
  /** Send now (or enqueue on failure/offline). */
  send: (params: QueueSendParams) => Promise<QueueSendResult>;
  /** Manually flush/retry the queue (also runs automatically on 'online'). */
  flush: () => Promise<void>;
};

export function useEmailQueue(): UseEmailQueueResult {
  const emailQueue = useKioskStore((s) => s.emailQueue);
  const enqueueEmail = useKioskStore((s) => s.enqueueEmail);
  const dequeueEmail = useKioskStore((s) => s.dequeueEmail);
  const updateQueuedEmail = useKioskStore((s) => s.updateQueuedEmail);
  const updateTransaction = useKioskStore((s) => s.updateTransaction);

  // Guard so overlapping flushes (listener + manual) don't double-send.
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (flushing.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    flushing.current = true;
    try {
      // Snapshot the queue so iteration is stable while we mutate the store.
      const items = useKioskStore.getState().emailQueue;
      for (const item of items) {
        const result = await sendEmail({
          to: item.email,
          imageBase64: item.imageDataUrl,
          filename: item.filename,
        });
        if (result.ok) {
          dequeueEmail(item.id);
          if (item.transactionId) {
            updateTransaction(item.transactionId, {
              emailStatus: 'sent',
              attempts: item.attempts + 1,
            });
          }
        } else {
          updateQueuedEmail(item.id, {
            attempts: item.attempts + 1,
            lastError: result.error,
          });
          if (item.transactionId) {
            updateTransaction(item.transactionId, { attempts: item.attempts + 1 });
          }
        }
      }
    } finally {
      flushing.current = false;
    }
  }, [dequeueEmail, updateQueuedEmail, updateTransaction]);

  const send = useCallback(
    async (params: QueueSendParams): Promise<QueueSendResult> => {
      const transactionId = params.transactionId ?? null;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

      /** Push this email onto the retry queue. */
      const enqueue = (lastError?: string) => {
        const item: QueuedEmail = {
          id: makeId('q'),
          transactionId,
          email: params.to,
          imageDataUrl: params.imageDataUrl,
          filename: params.filename,
          createdAt: Date.now(),
          attempts: 1,
          lastError,
        };
        enqueueEmail(item);
      };

      // Offline: don't even try the network — queue immediately.
      if (offline) {
        enqueue('offline');
        if (transactionId) {
          updateTransaction(transactionId, { emailStatus: 'pending', attempts: 1 });
        }
        return { sent: false, queued: true };
      }

      // Online: attempt an immediate send.
      const result = await sendEmail({
        to: params.to,
        imageBase64: params.imageDataUrl,
        filename: params.filename,
      });

      if (result.ok) {
        if (transactionId) {
          updateTransaction(transactionId, { emailStatus: 'sent', attempts: 1 });
        }
        return { sent: true, queued: false };
      }

      // Failure: queue for retry and surface the error.
      enqueue(result.error);
      if (transactionId) {
        updateTransaction(transactionId, { emailStatus: 'failed', attempts: 1 });
      }
      return { sent: false, queued: true, error: result.error };
    },
    [enqueueEmail, updateTransaction],
  );

  // Auto-flush when connectivity returns, and once on mount if anything is
  // already queued (e.g. the kiosk was reloaded while offline).
  useEffect(() => {
    const onOnline = () => {
      void flush();
    };
    window.addEventListener('online', onOnline);
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      void flush();
    }
    return () => window.removeEventListener('online', onOnline);
  }, [flush]);

  return { queueSize: emailQueue.length, send, flush };
}

export default useEmailQueue;
