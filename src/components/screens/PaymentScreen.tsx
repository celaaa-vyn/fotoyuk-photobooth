/**
 * Payment screen: shows the static QRIS image and the price. The user scans and
 * pays with their own phone. The operator checks their payment notification and
 * taps "Sudah Bayar", which opens the on-screen PIN pad. A correct 4-digit
 * OPERATOR PIN (== settings.operatorPin) advances to the camera. This is a
 * SEPARATE secret from the admin PIN: the operator types it in front of guests
 * on every session, so leaking it only advances the flow and never exposes the
 * admin panel (issue 2). "Batal" returns to welcome.
 */
import { useState } from 'react';
import BigButton from '../ui/BigButton';
import PinPad from '../ui/PinPad';
import { useKioskStore } from '../../store/useKioskStore';

/** Format an IDR amount like "Rp 25.000". */
function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function PaymentScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const settings = useKioskStore((s) => s.settings);

  const [showPin, setShowPin] = useState(false);
  const [pinError, setPinError] = useState(false);

  const qrisSrc = settings.qrisImage ?? '/qris-placeholder.png';

  return (
    <div className="animate-fade-in flex h-full items-center justify-center gap-12 px-10">
      {/* Left: QRIS + price */}
      <div className="flex flex-col items-center gap-6">
        <h2 className="text-big text-primary-700">Scan &amp; Bayar</h2>
        <div className="rounded-3xl bg-white p-6 shadow-xl">
          <img
            src={qrisSrc}
            alt="Kode QRIS pembayaran"
            className="h-64 w-64 object-contain"
          />
        </div>
        <p className="text-huge text-primary-600">{formatRupiah(settings.price)}</p>
        <p className="text-touch max-w-sm text-center text-primary-700">
          Scan QRIS dengan HP kamu, lalu panggil operator untuk melanjutkan.
        </p>
      </div>

      {/* Right: operator action */}
      <div className="flex min-w-[20rem] flex-col items-center gap-6">
        {showPin ? (
          <>
            <p className="text-touch text-primary-800">Masukkan PIN operator</p>
            <PinPad
              pin={settings.operatorPin}
              onComplete={() => goTo('camera')}
              onError={() => setPinError(true)}
            />
            {pinError && (
              <p className="animate-pop text-touch font-semibold text-accent-600">
                PIN salah, coba lagi.
              </p>
            )}
            <BigButton variant="secondary" onClick={() => setShowPin(false)}>
              Kembali
            </BigButton>
          </>
        ) : (
          <>
            <BigButton
              variant="primary"
              fullWidth
              onClick={() => {
                setPinError(false);
                setShowPin(true);
              }}
            >
              Sudah Bayar
            </BigButton>
            <BigButton variant="danger" fullWidth onClick={reset}>
              Batal
            </BigButton>
          </>
        )}
      </div>
    </div>
  );
}

export default PaymentScreen;
