/**
 * Admin screen: PIN-protected operator panel reached via the discreet gear on
 * the welcome screen. After entering the correct admin PIN (default 2802) the
 * operator can:
 *  - edit the displayed price (persisted to settings)
 *  - upload a static QRIS image (stored as a data URL in settings)
 *  - upload new transparent frame PNGs (appended to settings.frames)
 *  - change the ADMIN PIN (unlocks this panel) and the separate OPERATOR PIN
 *    (confirms the "Sudah Bayar" payment gate) - two distinct secrets (issue 2)
 *  - view the transaction history table and export it as CSV
 *
 * A "Kembali ke Beranda" button always returns to welcome so navigation never
 * dead-ends.
 */
import { useState } from 'react';
import type { ChangeEvent } from 'react';
import BigButton from '../ui/BigButton';
import PinPad from '../ui/PinPad';
import { useKioskStore } from '../../store/useKioskStore';
import { downloadTransactionsCsv } from '../../utils/csv';
import type { FrameAsset } from '../../types';

/** Read a File as a data URL (for QRIS / frame uploads stored in localStorage). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
    reader.readAsDataURL(file);
  });
}

/** Format an IDR amount like "Rp 25.000". */
function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`;
}

function AdminScreen() {
  const reset = useKioskStore((s) => s.reset);
  const settings = useKioskStore((s) => s.settings);
  const transactions = useKioskStore((s) => s.transactions);
  const setPrice = useKioskStore((s) => s.setPrice);
  const setAdminPin = useKioskStore((s) => s.setAdminPin);
  const setOperatorPin = useKioskStore((s) => s.setOperatorPin);
  const setQrisImage = useKioskStore((s) => s.setQrisImage);
  const addFrame = useKioskStore((s) => s.addFrame);
  const removeFrame = useKioskStore((s) => s.removeFrame);
  const clearTransactions = useKioskStore((s) => s.clearTransactions);

  const [authed, setAuthed] = useState(false);
  const [pinError, setPinError] = useState(false);

  // Id of the frame currently awaiting an on-screen delete confirmation. Null
  // means no confirm panel is open. We never use window.confirm because it is
  // unreliable in iOS fullscreen / Guided Access kiosk mode.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Local form state.
  const [priceInput, setPriceInput] = useState(String(settings.price));
  const [newPin, setNewPin] = useState('');
  const [newOperatorPin, setNewOperatorPin] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  // --- PIN gate ----------------------------------------------------------
  if (!authed) {
    return (
      <div className="animate-fade-in flex h-full flex-col items-center justify-center gap-6 px-10 text-center">
        <h1 className="text-big text-primary-700">Panel Admin</h1>
        <p className="text-touch text-primary-700">Masukkan PIN admin</p>
        <PinPad
          pin={settings.adminPin}
          onComplete={() => {
            setAuthed(true);
            setPinError(false);
          }}
          onError={() => setPinError(true)}
        />
        {pinError && (
          <p className="animate-pop text-touch font-semibold text-accent-600">
            PIN salah, coba lagi.
          </p>
        )}
        <BigButton variant="danger" onClick={reset}>
          Kembali ke Beranda
        </BigButton>
      </div>
    );
  }

  const savePrice = () => {
    const n = Number.parseInt(priceInput, 10);
    if (Number.isFinite(n) && n > 0) {
      setPrice(n);
      setStatus('Harga disimpan.');
    } else {
      setStatus('Harga tidak valid.');
    }
  };

  const onQrisChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setQrisImage(dataUrl);
      setStatus('QRIS diperbarui.');
    } catch {
      setStatus('Gagal mengunggah QRIS.');
    } finally {
      e.target.value = '';
    }
  };

  const onFrameChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const frame: FrameAsset = {
        id: `frame-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, '') || 'Frame Baru',
        src: dataUrl,
        layout: 'strip-2x6',
        custom: true,
      };
      addFrame(frame);
      setStatus('Frame ditambahkan.');
    } catch {
      setStatus('Gagal mengunggah frame.');
    } finally {
      e.target.value = '';
    }
  };

  const changePin = () => {
    if (/^\d{4}$/.test(newPin)) {
      setAdminPin(newPin);
      setNewPin('');
      setStatus('PIN admin diperbarui.');
    } else {
      setStatus('PIN admin harus 4 digit angka.');
    }
  };

  const changeOperatorPin = () => {
    if (/^\d{4}$/.test(newOperatorPin)) {
      setOperatorPin(newOperatorPin);
      setNewOperatorPin('');
      setStatus('PIN operator diperbarui.');
    } else {
      setStatus('PIN operator harus 4 digit angka.');
    }
  };

  const confirmRemoveFrame = (frameId: string) => {
    // removeFrame filters settings.frames by id regardless of custom and
    // persists via writeJSON, so default frames are removed and stay removed.
    removeFrame(frameId);
    setConfirmDeleteId(null);
    setStatus('Frame dihapus.');
  };

  const exportCsv = () => {
    if (transactions.length === 0) {
      setStatus('Belum ada transaksi untuk diekspor.');
      return;
    }
    downloadTransactionsCsv(transactions);
    setStatus('CSV diunduh.');
  };

  return (
    <div className="animate-fade-in flex h-full flex-col gap-6 overflow-y-auto px-8 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-big text-primary-700">Panel Admin</h1>
        <BigButton variant="danger" onClick={reset}>
          Kembali ke Beranda
        </BigButton>
      </div>

      {status && (
        <p className="animate-pop rounded-xl bg-primary-100 px-4 py-2 text-base font-semibold text-primary-700">
          {status}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Price */}
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-touch font-bold text-primary-700">Harga</h2>
          <p className="text-base text-primary-600">
            Saat ini: {formatRupiah(settings.price)}
          </p>
          <div className="flex gap-3">
            <input
              type="number"
              inputMode="numeric"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="min-h-touch w-full rounded-xl border-2 border-primary-200 px-4 text-touch focus:border-primary-500 focus:outline-none"
            />
            <BigButton variant="primary" onClick={savePrice}>
              Simpan
            </BigButton>
          </div>
        </section>

        {/* Admin PIN */}
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-touch font-bold text-primary-700">Ubah PIN Admin</h2>
          <p className="text-base text-primary-600">
            Membuka panel admin ini. Jangan ditunjukkan ke tamu.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN admin baru (4 digit)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              className="min-h-touch w-full rounded-xl border-2 border-primary-200 px-4 text-touch focus:border-primary-500 focus:outline-none"
            />
            <BigButton variant="primary" onClick={changePin}>
              Ubah
            </BigButton>
          </div>
        </section>

        {/* Operator PIN */}
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-touch font-bold text-primary-700">Ubah PIN Operator</h2>
          <p className="text-base text-primary-600">
            Dipakai di tombol "Sudah Bayar". Berbeda dari PIN admin.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN operator baru (4 digit)"
              value={newOperatorPin}
              onChange={(e) => setNewOperatorPin(e.target.value.replace(/\D/g, ''))}
              className="min-h-touch w-full rounded-xl border-2 border-primary-200 px-4 text-touch focus:border-primary-500 focus:outline-none"
            />
            <BigButton variant="primary" onClick={changeOperatorPin}>
              Ubah
            </BigButton>
          </div>
        </section>

        {/* QRIS */}
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-touch font-bold text-primary-700">Gambar QRIS</h2>
          <img
            src={settings.qrisImage ?? '/qris-placeholder.png'}
            alt="QRIS saat ini"
            className="h-40 w-40 self-start rounded-xl border-2 border-primary-100 object-contain"
          />
          <label className="min-h-touch inline-flex cursor-pointer items-center justify-center rounded-2xl bg-primary-600 px-6 text-touch font-bold text-white shadow-lg active:scale-95">
            Unggah QRIS
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onQrisChange}
            />
          </label>
        </section>

        {/* Frames */}
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-touch font-bold text-primary-700">Frame</h2>
          {settings.frames.length === 0 ? (
            <p className="rounded-xl bg-accent-50 px-4 py-3 text-base font-semibold text-accent-700">
              Belum ada frame. Unggah minimal satu frame PNG agar tamu bisa
              memilih.
            </p>
          ) : (
            <div className="flex flex-wrap gap-4">
              {settings.frames.map((frame) => {
                const confirming = confirmDeleteId === frame.id;
                return (
                  <div
                    key={frame.id}
                    className="flex w-28 flex-col items-center gap-2 rounded-2xl border-2 border-primary-100 bg-primary-50/50 p-3"
                  >
                    <img
                      src={frame.src}
                      alt={frame.name}
                      className="h-24 w-20 rounded-lg border-2 border-primary-100 bg-white object-contain"
                    />
                    <span className="max-w-full truncate text-sm font-semibold text-primary-600">
                      {frame.name}
                    </span>
                    {confirming ? (
                      <div className="flex w-full flex-col gap-2">
                        <p className="text-center text-sm font-bold text-accent-700">
                          Yakin hapus?
                        </p>
                        <button
                          type="button"
                          onClick={() => confirmRemoveFrame(frame.id)}
                          className="min-h-touch w-full rounded-xl bg-accent-600 px-3 text-base font-bold text-white shadow-md transition-transform active:scale-95"
                        >
                          Ya, hapus
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-touch w-full rounded-xl border-2 border-primary-200 bg-white px-3 text-base font-bold text-primary-700 shadow-sm transition-transform active:scale-95"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(frame.id)}
                        className="min-h-touch w-full rounded-xl bg-accent-600 px-3 text-base font-bold text-white shadow-md transition-transform active:scale-95"
                      >
                        Hapus
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <label className="min-h-touch inline-flex cursor-pointer items-center justify-center rounded-2xl bg-primary-600 px-6 text-touch font-bold text-white shadow-lg active:scale-95">
            Unggah Frame PNG
            <input
              type="file"
              accept="image/png"
              className="hidden"
              onChange={onFrameChange}
            />
          </label>
        </section>
      </div>

      {/* Transaction history */}
      <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-touch font-bold text-primary-700">
            Riwayat Transaksi ({transactions.length})
          </h2>
          <div className="flex gap-3">
            <BigButton variant="primary" onClick={exportCsv}>
              Ekspor CSV
            </BigButton>
            {transactions.length > 0 && (
              <BigButton variant="secondary" onClick={clearTransactions}>
                Hapus Riwayat
              </BigButton>
            )}
          </div>
        </div>
        <div className="max-h-72 overflow-auto">
          <table className="w-full border-collapse text-left text-base">
            <thead className="sticky top-0 bg-primary-50 text-primary-700">
              <tr>
                <th className="px-3 py-2">Waktu</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Harga</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-primary-400" colSpan={4}>
                    Belum ada transaksi.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr key={t.id} className="border-t border-primary-100">
                    <td className="px-3 py-2 text-primary-700">
                      {new Date(t.createdAt).toLocaleString('id-ID')}
                    </td>
                    <td className="px-3 py-2 text-primary-700">{t.email}</td>
                    <td className="px-3 py-2 text-primary-700">
                      {formatRupiah(t.price)}
                    </td>
                    <td className="px-3 py-2 text-primary-700">{t.emailStatus}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default AdminScreen;
