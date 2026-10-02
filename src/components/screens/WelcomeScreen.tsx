/**
 * Welcome screen: entry point of the kiosk. One big "Mulai" button and a short
 * instruction telling the user to pay via QRIS first, then call the operator.
 *
 * A discreet admin affordance sits in the bottom-right corner (a nearly
 * invisible tap target) so operators can reach the PIN-protected admin panel
 * without exposing it to regular users.
 */
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';

function WelcomeScreen() {
  const goTo = useKioskStore((s) => s.goTo);

  return (
    <div className="animate-fade-in relative flex h-full flex-col items-center justify-center gap-10 px-10 text-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-huge text-primary-600">FotoYuk</h1>
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

      {/* Discreet admin entry: low-opacity corner tap target for operators. */}
      <button
        type="button"
        aria-label="Admin"
        onClick={() => goTo('admin')}
        className="absolute bottom-2 right-2 h-14 w-14 rounded-full text-primary-200/40 opacity-30 transition-opacity active:opacity-100"
      >
        ⚙️
      </button>
    </div>
  );
}

export default WelcomeScreen;
