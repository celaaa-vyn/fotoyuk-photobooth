/**
 * Email screen: the user types their email so the final strip is sent as an
 * attachment. The input uses type=email + inputMode=email and autoFocus so the
 * iPad keyboard pops up automatically. "Kirim" is only enabled on a valid
 * address.
 *
 * On submit we record a Transaction, then send through the offline-tolerant
 * email queue (useEmailQueue). On immediate success we advance to thank-you.
 * On failure (or offline) the email is queued for auto-retry and the user is
 * told so, with a "Kirim ulang" option and the ability to continue anyway — the
 * user is never stuck on this screen.
 */
import { useState } from 'react';
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

  const submit = async () => {
    if (!valid) {
      setTouched(true);
      return;
    }
    if (!hasComposite) {
      // No image to send: never enqueue an empty payload. Steer the guest back
      // to the frame step to rebuild the composite.
      setSendError('Foto belum siap. Silakan ulangi pemilihan frame.');
      return;
    }
    const to = value.trim();
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

    // hasComposite is guaranteed true here (checked above), so we always send a
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
  };

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
            Hasil foto dengan frame gagal dibuat. Silakan kembali ke pemilihan
            frame untuk mencoba lagi.
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
          <BigButton variant="primary" onClick={() => goTo('frame')}>
            Kembali ke Frame
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
