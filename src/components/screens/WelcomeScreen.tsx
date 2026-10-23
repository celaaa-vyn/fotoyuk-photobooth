/**
 * Welcome screen: entry point of the kiosk. One big "Mulai" button and a short
 * instruction telling the user to pay via QRIS first, then call the operator.
 *
 * Admin access (issue 2): there are two unobtrusive ways to reach the
 * PIN-protected admin panel without exposing it to regular guests:
 *  - tapping the big "FotoYuk" logo 5 times in quick succession (the counter
 *    resets if more than ~1.5s passes between taps), and
 *  - a discreet gear button in the bottom-right corner.
 * Neither affordance shows any hint text, and the admin panel still requires
 * the admin PIN afterwards, so a curious guest learns nothing.
 */
import { useRef } from 'react';
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';

/** Number of logo taps that opens admin. */
const ADMIN_TAP_COUNT = 5;
/** Max gap (ms) allowed between taps before the counter resets. */
const ADMIN_TAP_WINDOW_MS = 1500;

function WelcomeScreen() {
  const goTo = useKioskStore((s) => s.goTo);

  // Rolling tap tracker for the hidden admin gesture. Kept in refs so taps do
  // not trigger re-renders or reveal any state to the guest.
  const tapCountRef = useRef(0);
  const lastTapRef = useRef(0);

  const handleLogoTap = () => {
    const now = Date.now();
    // Reset the streak if the previous tap was too long ago.
    if (now - lastTapRef.current > ADMIN_TAP_WINDOW_MS) {
      tapCountRef.current = 0;
    }
    lastTapRef.current = now;
    tapCountRef.current += 1;
    if (tapCountRef.current >= ADMIN_TAP_COUNT) {
      tapCountRef.current = 0;
      goTo('admin');
    }
  };

  return (
    <div className="animate-fade-in relative flex h-full flex-col items-center justify-center gap-10 px-10 text-center">
      <div className="flex flex-col items-center gap-5">
        {/* The logo doubles as the hidden 5-tap admin gesture. No hint shown. */}
        <button
          type="button"
          onClick={handleLogoTap}
          aria-label="FotoYuk"
          className="rounded-3xl px-6 py-2 transition-transform active:scale-95 focus:outline-none"
        >
          <span className="text-huge bg-gradient-to-br from-primary-500 via-primary-600 to-accent-500 bg-clip-text text-transparent drop-shadow-sm">
            FotoYuk
          </span>
        </button>
        <p className="text-big text-primary-800">Abadikan momen serumu! 🎉</p>
      </div>

      <div className="animate-pop rounded-3xl bg-white/70 px-8 py-5 shadow-card backdrop-blur-sm">
        <p className="text-touch max-w-2xl text-primary-700">
          Bayar dulu ke QRIS, lalu panggil operator
        </p>
      </div>

      <BigButton
        variant="primary"
        onClick={() => goTo('payment')}
        className="animate-float-slow px-16 py-6 text-big shadow-glow"
      >
        Mulai
      </BigButton>

      {/* Discreet admin entry: low-opacity corner tap target for operators. */}
      <button
        type="button"
        aria-label="Admin"
        onClick={() => goTo('admin')}
        className="absolute bottom-3 right-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/50 text-2xl text-primary-500 opacity-60 shadow-sm transition-opacity active:opacity-100"
      >
        ⚙️
      </button>
    </div>
  );
}

export default WelcomeScreen;
