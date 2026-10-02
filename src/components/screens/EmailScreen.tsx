/**
 * Email screen: the user types their email so the final strip can be sent as an
 * attachment. The input uses type=email + inputMode=email and autoFocus so the
 * iPad keyboard pops up automatically. "Kirim" is only enabled on a valid
 * address. The actual send is wired in FEAT-003; here we store the email and
 * advance to the thank-you screen.
 */
import { useState } from 'react';
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';

/** Pragmatic email format check (not RFC-exhaustive, good enough for kiosk). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function EmailScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const storedEmail = useKioskStore((s) => s.email);
  const setEmail = useKioskStore((s) => s.setEmail);

  const [value, setValue] = useState(storedEmail);
  const [touched, setTouched] = useState(false);

  const valid = EMAIL_REGEX.test(value.trim());
  const showError = touched && !valid && value.length > 0;

  const submit = () => {
    if (!valid) {
      setTouched(true);
      return;
    }
    setEmail(value.trim());
    goTo('thankyou');
  };

  return (
    <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-8 px-10 text-center">
      <h2 className="text-big text-primary-700">Kirim ke Email</h2>
      <p className="text-touch max-w-xl text-primary-700">
        Masukkan email kamu, hasil foto akan dikirim sebagai lampiran.
      </p>

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
            if (e.key === 'Enter') submit();
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

      <div className="flex gap-4">
        <BigButton variant="primary" disabled={!valid} onClick={submit}>
          Kirim
        </BigButton>
        <BigButton variant="danger" onClick={reset}>
          Batal
        </BigButton>
      </div>
    </div>
  );
}

export default EmailScreen;
