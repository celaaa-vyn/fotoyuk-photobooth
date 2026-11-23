/**
 * Top-of-screen progress indicator for the mandatory flow steps.
 * The current step is highlighted; completed steps are filled. Hidden on the
 * admin screen (App decides whether to render it).
 */
import type { KioskStep } from '../../types';
import { useKioskStore } from '../../store/useKioskStore';

/** Ordered flow steps shown in the indicator (admin is excluded). */
const FLOW_STEPS: { step: KioskStep; label: string }[] = [
  { step: 'welcome', label: 'Mulai' },
  { step: 'payment', label: 'Bayar' },
  { step: 'frame', label: 'Frame' },
  { step: 'camera', label: 'Foto' },
  { step: 'preview', label: 'Pratinjau' },
  { step: 'email', label: 'Email' },
  { step: 'thankyou', label: 'Selesai' },
];

type ProgressBarProps = {
  current: KioskStep;
};

function ProgressBar({ current }: ProgressBarProps) {
  // In AUTO (hardcopy) mode the customer never sees the email step, so drop its
  // label to avoid a misleading "Email" stage. MANUAL mode still needs it.
  const autoSend = useKioskStore((s) => s.settings.autoSendEnabled);
  const steps = autoSend
    ? FLOW_STEPS.filter((s) => s.step !== 'email')
    : FLOW_STEPS;

  // The hidden 'email' step only flashes for one frame in AUTO mode before the
  // store advances to 'thankyou'; treat it as the final step so nothing in the
  // indicator appears to vanish or reset during that transition.
  const effectiveStep: KioskStep =
    autoSend && current === 'email' ? 'thankyou' : current;
  const currentIndex = steps.findIndex((s) => s.step === effectiveStep);

  return (
    <nav
      aria-label="Progress"
      className="pad-safe-x flex w-full items-center justify-center gap-2 px-6 pt-safe-t"
    >
      <ol className="flex w-full max-w-4xl items-center gap-2">
        {steps.map((item, i) => {
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
