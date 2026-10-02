/**
 * Welcome screen: entry point of the kiosk. One big "Mulai" button and a short
 * instruction telling the user to pay via QRIS first, then call the operator.
 */
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';

function WelcomeScreen() {
  const goTo = useKioskStore((s) => s.goTo);

  return (
    <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-10 px-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-huge text-primary-600">Photobooth</h1>
        <p className="text-big text-primary-800">Abadikan momen serumu! 🎉</p>
      </div>

      <p className="text-touch max-w-2xl text-primary-700">
        Bayar dulu ke QRIS, lalu panggil operator
      </p>

      <BigButton
        variant="primary"
        onClick={() => goTo('payment')}
        className="px-16 py-6 text-big"
      >
        Mulai
      </BigButton>
    </div>
  );
}

export default WelcomeScreen;
