/**
 * Frame screen: a swipeable/scrollable gallery of transparent frame overlays
 * from settings.frames. The customer picks a frame BEFORE taking photos, so
 * this screen can no longer build the final composite from captured photos.
 * Instead it shows a REPRESENTATIVE preview: the frame PNG laid over neutral
 * placeholder slots (not real customer photos). The actual composite is built
 * later, after capture, on the way to the email step.
 *
 * Choosing a frame stores it via setFrame(selectedFrameId); "Lanjut" advances
 * to the camera, where the number of photos follows the frame's slot count.
 */
import { useEffect, useState } from 'react';
import BigButton from '../ui/BigButton';
import SlotFrameView from '../ui/SlotFrameView';
import { useKioskStore } from '../../store/useKioskStore';

function FrameScreen() {
  const goTo = useKioskStore((s) => s.goTo);
  const reset = useKioskStore((s) => s.reset);
  const frames = useKioskStore((s) => s.settings.frames);
  const selectedFrameId = useKioskStore((s) => s.selectedFrameId);
  const setFrame = useKioskStore((s) => s.setFrame);

  // Default to the first frame if none chosen yet.
  const [selected, setSelected] = useState<string | null>(
    selectedFrameId ?? frames[0]?.id ?? null,
  );

  const selectedFrame = frames.find((f) => f.id === selected) ?? null;

  const hasFrames = frames.length > 0;

  // Number of placeholder slots shown in the preview mirrors how many photos
  // the chosen frame will capture (slots.length), falling back to 4.
  const previewSlotCount = selectedFrame?.slots?.length ?? 4;

  useEffect(() => {
    setFrame(selected);
  }, [selected, setFrame]);

  // Graceful empty-frames state: if the admin removed every frame the customer
  // flow must not crash (no frames[0] indexing). Show a friendly message and a
  // safe path back to welcome.
  if (!hasFrames) {
    return (
      <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-8 px-10 text-center">
        <div className="animate-pop flex max-w-xl flex-col gap-3 rounded-3xl bg-white/80 px-10 py-8 shadow-card backdrop-blur-sm">
          <span className="text-6xl">🖼️</span>
          <h2 className="text-big text-primary-700">Frame Belum Tersedia</h2>
          <p className="text-touch text-primary-700">
            Belum ada frame, minta admin untuk mengunggah dulu.
          </p>
        </div>
        <BigButton variant="danger" onClick={reset}>
          Batal
        </BigButton>
      </div>
    );
  }

  return (
    <div className="animate-fade-in flex h-full items-center justify-center gap-10 px-10">
      {/* Representative preview: frame PNG over neutral placeholder slots that
          follow the frame's real slot layout. SlotFrameView is the SAME render
          path used by the Frame Editor and the camera StripPreview, so the slot
          positions here are identical to the editor and the final composite. */}
      <div className="flex flex-col items-center gap-4">
        <h2 className="text-big text-primary-700">Pratinjau</h2>
        <SlotFrameView
          frame={selectedFrame}
          fallbackCount={previewSlotCount}
          stageClassName="mx-auto w-full max-w-[18rem] rounded-3xl border-4 border-primary-200 bg-white shadow-card"
          renderSlot={(i) => (
            <div className="flex h-full w-full items-center justify-center bg-primary-100 text-base font-semibold text-primary-300 shadow-inner">
              {i + 1}
            </div>
          )}
        />
        <p className="max-w-[11rem] text-center text-base text-primary-600">
          {previewSlotCount} foto akan diambil dengan frame ini.
        </p>
      </div>

      {/* Frame gallery */}
      <div className="flex max-w-xl flex-col gap-6">
        <h2 className="text-big text-primary-700">Pilih Frame</h2>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {frames.map((frame) => {
            const active = frame.id === selected;
            return (
              <button
                key={frame.id}
                type="button"
                onClick={() => setSelected(frame.id)}
                className={[
                  'min-h-touch flex w-32 shrink-0 flex-col items-center gap-2 rounded-3xl border-4 p-3 shadow-md transition-transform active:scale-95',
                  active
                    ? 'border-primary-600 bg-primary-50 shadow-glow'
                    : 'border-primary-100 bg-white',
                ].join(' ')}
              >
                <img
                  src={frame.src}
                  alt={frame.name}
                  className="h-32 w-full object-contain"
                />
                <span className="text-base font-semibold text-primary-700">
                  {frame.name}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-4">
          <BigButton
            variant="primary"
            disabled={!selected}
            onClick={() => goTo('camera')}
          >
            Lanjut
          </BigButton>
          <BigButton variant="danger" onClick={reset}>
            Batal
          </BigButton>
        </div>
      </div>
    </div>
  );
}

export default FrameScreen;
