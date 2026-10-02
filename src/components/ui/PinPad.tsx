/**
 * On-screen 4-digit numeric PIN pad.
 *
 * It intentionally does NOT rely on the hardware keyboard so it works reliably
 * in iOS Guided Access / fullscreen kiosk mode. Entry is masked with dots.
 * When 4 digits are entered it validates against `pin`: a match fires
 * onComplete, a mismatch fires onError and clears the entry so the operator
 * can retry.
 */
import { useState } from 'react';

type PinPadProps = {
  /** The correct PIN to validate the entry against. */
  pin: string;
  /** Fired when the entered 4 digits match `pin`. */
  onComplete: () => void;
  /** Fired when a full 4-digit entry does not match. */
  onError?: () => void;
};

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

function PinPad({ pin, onComplete, onError }: PinPadProps) {
  const [entry, setEntry] = useState('');

  const press = (digit: string) => {
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + digit;
    setEntry(next);
    if (next.length === PIN_LENGTH) {
      // Defer validation a tick so the final dot renders first.
      window.setTimeout(() => {
        if (next === pin) {
          onComplete();
        } else {
          onError?.();
        }
        setEntry('');
      }, 150);
    }
  };

  const backspace = () => setEntry((e) => e.slice(0, -1));
  const clear = () => setEntry('');

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Masked entry dots */}
      <div className="flex gap-4" aria-label="PIN entry">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <span
            key={i}
            className={[
              'h-5 w-5 rounded-full border-2 transition-colors',
              i < entry.length
                ? 'border-primary-600 bg-primary-600'
                : 'border-primary-300 bg-transparent',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Numeric keypad */}
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="min-h-touch min-w-touch rounded-2xl bg-white text-big font-bold text-primary-800 shadow-md transition-transform duration-100 active:scale-95"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={clear}
          className="min-h-touch min-w-touch rounded-2xl bg-primary-100 text-touch font-bold text-primary-700 shadow-md transition-transform duration-100 active:scale-95"
        >
          C
        </button>
        <button
          type="button"
          onClick={() => press('0')}
          className="min-h-touch min-w-touch rounded-2xl bg-white text-big font-bold text-primary-800 shadow-md transition-transform duration-100 active:scale-95"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          aria-label="Hapus"
          className="min-h-touch min-w-touch rounded-2xl bg-primary-100 text-touch font-bold text-primary-700 shadow-md transition-transform duration-100 active:scale-95"
        >
          ⌫
        </button>
      </div>
    </div>
  );
}

export default PinPad;
