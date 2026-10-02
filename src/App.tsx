/**
 * App shell: routes between the six kiosk flow screens (plus admin) based on
 * the Zustand store's `step`. A ProgressBar sits on top for the six flow steps
 * (hidden on admin). Each step is wrapped in a keyed container so React
 * remounts it on change, replaying the fade-in transition for a smooth feel.
 *
 * The admin screen (price, QRIS/frame uploads, PIN change, history + CSV
 * export) is PIN-gated and reached via a discreet affordance on welcome.
 */
import ProgressBar from './components/ui/ProgressBar';
import WelcomeScreen from './components/screens/WelcomeScreen';
import PaymentScreen from './components/screens/PaymentScreen';
import CameraScreen from './components/screens/CameraScreen';
import FrameScreen from './components/screens/FrameScreen';
import EmailScreen from './components/screens/EmailScreen';
import ThankYouScreen from './components/screens/ThankYouScreen';
import AdminScreen from './components/screens/AdminScreen';
import { useKioskStore } from './store/useKioskStore';
import type { KioskStep } from './types';

function renderStep(step: KioskStep) {
  switch (step) {
    case 'welcome':
      return <WelcomeScreen />;
    case 'payment':
      return <PaymentScreen />;
    case 'camera':
      return <CameraScreen />;
    case 'frame':
      return <FrameScreen />;
    case 'email':
      return <EmailScreen />;
    case 'thankyou':
      return <ThankYouScreen />;
    case 'admin':
      return <AdminScreen />;
    default:
      return <WelcomeScreen />;
  }
}

function App() {
  const step = useKioskStore((s) => s.step);
  const showProgress = step !== 'admin';

  return (
    <div className="pad-safe flex h-full min-h-full flex-col bg-primary-50 text-primary-900">
      {showProgress && (
        <header className="shrink-0 py-3">
          <ProgressBar current={step} />
        </header>
      )}

      {/* Keyed wrapper replays the fade-in animation on each step change. */}
      <main key={step} className="flex min-h-0 flex-1 flex-col">
        {renderStep(step)}
      </main>
    </div>
  );
}

export default App;
