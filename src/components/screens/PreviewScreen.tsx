/**
 * Preview screen: the final confirmation step before finishing. It shows the
 * finished composite (captured photos + frame) large and centred so the
 * customer can see exactly what will be printed. "Lanjut" finishes the session;
 * "Batal" resets the whole session back to welcome.
 *
 * Because the result is a HARDCOPY, the customer never types or sees an email
 * step. In AUTO mode "Lanjut" hands off to the (invisible) email step, which
 * sends the photo silently to the fixed address so the operator can print it,
 * then lands on the "Fotomu sedang diproses" thank-you screen. In MANUAL mode
 * the original email form still appears. The copy here stays email-neutral.
 *
 * The composite is built once in CameraScreen and stored as compositeDataUrl;
 * this screen (and the send path afterwards) simply read that same image, so no
 * recomputation happens here and the delivered image always matches the preview.
 *
 * Safety: if the composite is missing (compositing failed), the customer is not
 * stranded. We show a friendly notice and offer a path back to the camera to
 * retake, plus the always-available Batal.
 */
import BigButton from '../ui/BigButton';
import { useKioskStore } from '../../store/useKioskStore';

function PreviewScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const compositeDataUrl = useKioskStore((s) => s.compositeDataUrl);

  const hasComposite =
    typeof compositeDataUrl === 'string' && compositeDataUrl.length > 0;

  if (!hasComposite) {
    return (
      <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-8 px-10 text-center">
        <div className="animate-pop flex max-w-xl flex-col gap-3 rounded-3xl bg-white/80 px-10 py-8 shadow-card backdrop-blur-sm">
          <span className="text-6xl">🙈</span>
          <h2 className="text-big text-primary-700">Pratinjau Belum Siap</h2>
          <p className="text-touch text-primary-700">
            Hasil foto dengan frame gagal dibuat. Silakan ambil foto lagi.
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          <BigButton variant="primary" onClick={() => goTo('camera')}>
            Foto Ulang
          </BigButton>
          <BigButton variant="danger" onClick={reset}>
            Batal
          </BigButton>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex h-full flex-col items-center gap-6 px-8 py-4">
      <h2 className="text-big text-primary-700">Pratinjau Hasil</h2>
      <p className="text-touch max-w-2xl text-center text-primary-700">
        Ini hasil foto kamu. Kalau sudah oke, tekan Lanjut.
      </p>

      {/* Large centred composite result. */}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <img
          src={compositeDataUrl as string}
          alt="Pratinjau hasil foto dengan frame"
          className="max-h-full w-auto max-w-full rounded-3xl border-4 border-primary-200 bg-white object-contain shadow-card"
        />
      </div>

      <div className="flex flex-wrap justify-center gap-4">
        <BigButton variant="primary" onClick={() => goTo('email')}>
          Lanjut
        </BigButton>
        <BigButton variant="danger" onClick={reset}>
          Batal
        </BigButton>
      </div>
    </div>
  );
}

export default PreviewScreen;
