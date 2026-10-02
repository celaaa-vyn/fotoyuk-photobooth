/**
 * Top-of-screen progress indicator for the 6 mandatory flow steps.
 * The current step is highlighted; completed steps are filled. Hidden on the
 * admin screen (App decides whether to render it).
 */
import type { KioskStep } from '../../types';

/** Ordered flow steps shown in the indicator (admin is excluded). */
const FLOW_STEPS: { step: KioskStep; label: string }[] = [
  { step: 'welcome', label: 'Mulai' },
  { step: 'payment', label: 'Bayar' },
  { step: 'camera', label: 'Foto' },
  { step: 'frame', label: 'Frame' },
  { step: 'email', label: 'Email' },
  { step: 'thankyou', label: 'Selesai' },
];

type ProgressBarProps = {
  current: KioskStep;
};

function ProgressBar({ current }: ProgressBarProps) {
  const currentIndex = FLOW_STEPS.findIndex((s) => s.step === current);

  return (
    <nav
      aria-label="Progress"
      className="pad-safe-x flex w-full items-center justify-center gap-2 px-6 pt-safe-t"
    >
      <ol className="flex w-full max-w-4xl items-center gap-2">
        {FLOW_STEPS.map((item, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <li key={item.step} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={[
                  'h-2 w-full rounded-full transition-colors duration-300',
                  done ? 'bg-primary-400' : active ? 'bg-primary-600' : 'bg-primary-100',
                ].join(' ')}
              />
              <span
                className={[
                  'text-sm font-semibold transition-colors duration-300',
                  active
                    ? 'text-primary-700'
                    : done
                      ? 'text-primary-400'
                      : 'text-primary-300',
                ].join(' ')}
              >
                {item.label}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default ProgressBar;
