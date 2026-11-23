/**
 * Thank-you screen: closes the session with a cheerful message. It auto-resets
 * back to welcome after 10 seconds (so the kiosk is ready for the next user)
 * and also offers a manual "Selesai" button.
 *
 * The result is a HARDCOPY: the operator receives the emailed photo and prints
 * it, so the customer is never told anything about email. The main message is
 * always "Fotomu sedang diproses". If this session's send was only queued
 * (offline), a small, email-neutral hint reassures that processing may take a
 * little longer, without exposing the delivery mechanism.
 */
import { useEffect, useState } from 'react';
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';

/** Seconds before the kiosk returns to welcome automatically. */
const AUTO_RESET_SECONDS = 10;

function ThankYouScreen() {
  const reset = useKioskStore((s) => s.reset);
  const emailOutcome = useKioskStore((s) => s.emailOutcome);
  const [remaining, setRemaining] = useState(AUTO_RESET_SECONDS);

  useEffect(() => {
    if (remaining <= 0) {
      reset();
      return undefined;
    }
    const t = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(t);
  }, [remaining, reset]);

  return (
    <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-8 px-10 text-center">
      <h1 className="text-huge text-primary-600">Terima Kasih! 🎉</h1>
      <p className="text-big text-primary-800">Fotomu sedang diproses</p>
      <p className="text-touch text-primary-700">Silakan tunggu hasil cetaknya ya.</p>
      {emailOutcome === 'queued' && (
        <p className="text-base text-primary-500">
          Prosesnya mungkin butuh waktu sedikit lebih lama.
        </p>
      )}
      <p className="text-touch text-primary-600">
        Kembali ke awal dalam {remaining} detik…
      </p>
      <BigButton variant="primary" onClick={reset} className="px-16">
        Selesai
      </BigButton>
    </div>
  );
}

export default ThankYouScreen;
