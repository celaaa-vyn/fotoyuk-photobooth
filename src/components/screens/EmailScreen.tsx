/**
 * Email screen: delivers the finished strip to an address.
 *
 * Two modes, controlled by settings.autoSendEnabled (toggled in the admin
 * panel):
 *
 *  - AUTO  : the finished photo is sent straight to the fixed
 *            settings.autoSendEmail address. No form is shown, no typing is
 *            required; the screen shows a "mengirim..." state, then the result,
 *            and advances to thank-you automatically.
 *  - MANUAL: the customer types their own email (type=email + inputMode=email +
 *            autoFocus so the iPad keyboard pops up) and taps "Kirim". This is
 *            the original behaviour, unchanged.
 *
 * Both modes share ONE send path (`runSend`): record a Transaction, send through
 * the offline-tolerant email queue (useEmailQueue), set emailOutcome so the
 * thank-you screen's message is accurate, and on immediate success advance to
 * thank-you. On failure/offline the email is queued for auto-retry; the user is
 * told and is never stuck.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';
import { useEmailQueue } from '../../hooks/useEmailQueue';
import type { Transaction } from '../../types';

/** Pragmatic email format check (not RFC-exhaustive, good enough for kiosk). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Generate a reasonably-unique transaction id. */
function makeTxId(): string {
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function EmailScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const storedEmail = useKioskStore((s) => s.email);
  const setEmail = useKioskStore((s) => s.setEmail);
  const settings = useKioskStore((s) => s.settings);
  const selectedFrameId = useKioskStore((s) => s.selectedFrameId);
  const compositeDataUrl = useKioskStore((s) => s.compositeDataUrl);
  const addTransaction = useKioskStore((s) => s.addTransaction);
  const queuePersistError = useKioskStore((s) => s.queuePersistError);
  const setEmailOutcome = useKioskStore((s) => s.setEmailOutcome);

  const { send } = useEmailQueue();

  const autoSend = settings.autoSendEnabled;

  const [value, setValue] = useState(storedEmail);
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [queuedNote, setQueuedNote] = useState(false);

  const valid = EMAIL_REGEX.test(value.trim());
  const showError = touched && !valid && value.length > 0;
  // Guard the composite: if frame compositing failed there is nothing to send,
  // so block submit entirely rather than enqueuing an empty, unsendable payload
  // that would retry forever (issue 3).
  const hasComposite = typeof compositeDataUrl === 'string' && compositeDataUrl.length > 0;

  /**
   * Shared send path for both AUTO and MANUAL. Records the transaction, sends
   * (or queues) the composite, sets emailOutcome, and advances to thank-you on
   * immediate success. Returns nothing; callers react to the state it sets.
   */
  const runSend = useCallback(
    async (to: string) => {
      setEmail(to);
      setSending(true);
      setSendError(null);
      setQueuedNote(false);

      // Record the transaction up front; status is updated by the queue.
      const tx: Transaction = {
        id: makeTxId(),
        createdAt: Date.now(),
        email: to,
        price: settings.price,
        frameId: selectedFrameId,
        emailStatus: 'pending',
        attempts: 0,
      };
      addTransaction(tx);

      // hasComposite is guaranteed true by the callers, so we always send a
      // real image, never an empty string.
      const result = await send({
        to,
        imageDataUrl: compositeDataUrl as string,
        filename: 'fotoyuk-strip.jpg',
        transactionId: tx.id,
      });

      setSending(false);

      if (result.sent) {
        setEmailOutcome('sent');
        goTo('thankyou');
        return;
      }
      // Queued (offline or failed): tell the user, offer resend + continue.
      setEmailOutcome('queued');
      setQueuedNote(true);
      setSendError(result.error ?? null);
    },
    [
      addTransaction,
      compositeDataUrl,
      goTo,
      selectedFrameId,
      send,
      setEmail,
      setEmailOutcome,
      settings.price,
    ],
  );

  /** MANUAL submit: validate the typed address, then run the shared send. */
  const submit = async () => {
    if (!valid) {
      setTouched(true);
      return;
    }
    if (!hasComposite) {
      // No image to send: never enqueue an empty payload. Steer the guest back
      // to the camera to retake the photos and rebuild the composite.
      setSendError('Foto belum siap. Silakan ulangi pengambilan foto.');
      return;
    }
    await runSend(value.trim());
  };

  // AUTO mode: fire the send exactly once on mount when a composite is ready.
  // A ref guards against the effect re-running (e.g. under React strict mode)
  // so we never double-send or create duplicate transactions.
  const autoFiredRef = useRef(false);
  useEffect(() => {
    if (!autoSend) return;
    if (autoFiredRef.current) return;
    if (!hasComposite) return;
    autoFiredRef.current = true;
    void runSend(settings.autoSendEmail.trim());
  }, [autoSend, hasComposite, runSend, settings.autoSendEmail]);

  // --- AUTO mode view ----------------------------------------------------
  if (autoSend) {
    return (
      <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-6 px-10 text-center">
        <h2 className="text-big text-primary-700">Mengirim Foto</h2>

        {!hasComposite ? (
          <>
            <div className="animate-pop flex max-w-xl flex-col gap-2 rounded-2xl bg-accent-50 px-6 py-4">
              <p className="text-touch font-semibold text-accent-700">
                Foto belum siap diproses.
              </p>
              <p className="text-base text-accent-600">
                Hasil foto dengan frame gagal dibuat. Silakan kembali untuk
                mengambil foto lagi.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              <BigButton variant="primary" onClick={() => goTo('camera')}>
                Kembali ke Foto
              </BigButton>
              <BigButton variant="danger" onClick={reset}>
                Batal
              </BigButton>
            </div>
          </>
        ) : !queuedNote ? (
          <>
            <p className="text-touch max-w-xl text-primary-700">
              Foto kamu sedang dikirim. Tunggu sebentar ya.
            </p>
            <span className="animate-pulse text-6xl">📤</span>
            {/* Batal stays available so the session can never get stuck. */}
            <BigButton variant="danger" onClick={reset}>
              Batal
            </BigButton>
          </>
        ) : (
          <>
            <div className="animate-pop flex max-w-xl flex-col gap-2 rounded-2xl bg-accent-50 px-6 py-4">
              <p className="text-touch font-semibold text-accent-700">
                Email belum terkirim dan sudah masuk antrean.
              </p>
              <p className="text-base text-accent-600">
                Foto akan dikirim otomatis saat internet kembali. Kamu bisa coba
                kirim ulang atau lanjut.
              </p>
              {queuePersistError && (
                <p className="text-sm font-semibold text-accent-600">
                  Perhatian: penyimpanan antrean penuh, antrean mungkin hilang
                  jika aplikasi dimuat ulang. Sebaiknya coba kirim ulang
                  sekarang.
                </p>
              )}
              {sendError && (
                <p className="text-sm text-accent-500">Detail: {sendError}</p>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              <BigButton
                variant="primary"
                disabled={sending}
                onClick={() => void runSend(settings.autoSendEmail.trim())}
              >
                {sending ? 'Mengirim…' : 'Kirim Ulang'}
              </BigButton>
              <BigButton variant="secondary" onClick={() => goTo('thankyou')}>
                Lanjut
              </BigButton>
              <BigButton variant="danger" onClick={reset}>
                Batal
              </BigButton>
            </div>
          </>
        )}
      </div>
    );
  }

  // --- MANUAL mode view --------------------------------------------------
  return (
    <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-6 px-10 text-center">
      <h2 className="text-big text-primary-700">Kirim ke Email</h2>
      <p className="text-touch max-w-xl text-primary-700">
        Masukkan email kamu, hasil foto akan dikirim sebagai lampiran.
      </p>

      {!hasComposite && (
        <div className="animate-pop flex max-w-xl flex-col gap-2 rounded-2xl bg-accent-50 px-6 py-4">
          <p className="text-touch font-semibold text-accent-700">
            Foto belum siap diproses.
          </p>
          <p className="text-base text-accent-600">
            Hasil foto dengan frame gagal dibuat. Silakan kembali untuk
            mengambil foto lagi.
          </p>
        </div>
      )}

      <div className="flex w-full max-w-xl flex-col gap-2">
        <input
          type="email"
          inputMode="email"
          autoFocus
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="nama@email.com"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
          }}
          className={[
            'min-h-touch w-full rounded-2xl border-4 bg-white px-6 py-4 text-touch text-primary-900 shadow-md focus:outline-none',
            showError ? 'border-accent-500' : 'border-primary-200 focus:border-primary-500',
          ].join(' ')}
        />
        {showError && (
          <p className="animate-pop text-left text-touch font-semibold text-accent-600">
            Format email tidak valid.
          </p>
        )}
      </div>

      {queuedNote && (
        <div className="animate-pop flex max-w-xl flex-col gap-2 rounded-2xl bg-accent-50 px-6 py-4">
          <p className="text-touch font-semibold text-accent-700">
            Email belum terkirim dan sudah masuk antrean.
          </p>
          <p className="text-base text-accent-600">
            Foto akan dikirim otomatis saat internet kembali. Kamu bisa coba
            kirim ulang atau lanjut.
          </p>
          {queuePersistError && (
            <p className="text-sm font-semibold text-accent-600">
              Perhatian: penyimpanan antrean penuh, antrean mungkin hilang jika
              aplikasi dimuat ulang. Sebaiknya coba kirim ulang sekarang.
            </p>
          )}
          {sendError && (
            <p className="text-sm text-accent-500">Detail: {sendError}</p>
          )}
        </div>
      )}

      {/* Show the composite-not-ready error outside the queued flow too. */}
      {!queuedNote && sendError && !hasComposite && (
        <p className="animate-pop text-touch font-semibold text-accent-600">
          {sendError}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-4">
        {!hasComposite ? (
          <BigButton variant="primary" onClick={() => goTo('camera')}>
            Kembali ke Foto
          </BigButton>
        ) : !queuedNote ? (
          <BigButton
            variant="primary"
            disabled={!valid || sending}
            onClick={() => void submit()}
          >
            {sending ? 'Mengirim…' : 'Kirim'}
          </BigButton>
        ) : (
          <>
            <BigButton
              variant="primary"
              disabled={sending}
              onClick={() => void submit()}
            >
              {sending ? 'Mengirim…' : 'Kirim Ulang'}
            </BigButton>
            <BigButton variant="secondary" onClick={() => goTo('thankyou')}>
              Lanjut
            </BigButton>
          </>
        )}
        <BigButton variant="danger" onClick={reset}>
          Batal
        </BigButton>
      </div>
    </div>
  );
}

export default EmailScreen;
