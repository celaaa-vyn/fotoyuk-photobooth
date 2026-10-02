/**
 * Admin screen: PIN-protected operator panel reached via the discreet gear on
 * the welcome screen. After entering the correct admin PIN (default 2802) the
 * operator can:
 *  - edit the displayed price (persisted to settings)
 *  - upload a static QRIS image (stored as a data URL in settings)
 *  - upload new transparent frame PNGs (appended to settings.frames)
 *  - change the admin PIN
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
  const setQrisImage = useKioskStore((s) => s.setQrisImage);
  const addFrame = useKioskStore((s) => s.addFrame);
  const removeFrame = useKioskStore((s) => s.removeFrame);
  const clearTransactions = useKioskStore((s) => s.clearTransactions);

  const [authed, setAuthed] = useState(false);
  const [pinError, setPinError] = useState(false);

  // Local form state.
  const [priceInput, setPriceInput] = useState(String(settings.price));
  const [newPin, setNewPin] = useState('');
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
      setStatus('PIN diperbarui.');
    } else {
      setStatus('PIN harus 4 digit angka.');
    }
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

        {/* PIN */}
        <section className="flex flex-col gap-3 rounded-2xl bg-white p-5 shadow-md">
          <h2 className="text-touch font-bold text-primary-700">Ubah PIN Admin</h2>
          <div className="flex gap-3">
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              placeholder="PIN baru (4 digit)"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              className="min-h-touch w-full rounded-xl border-2 border-primary-200 px-4 text-touch focus:border-primary-500 focus:outline-none"
            />
            <BigButton variant="primary" onClick={changePin}>
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
          <div className="flex flex-wrap gap-3">
            {settings.frames.map((frame) => (
              <div key={frame.id} className="flex flex-col items-center gap-1">
                <img
                  src={frame.src}
                  alt={frame.name}
                  className="h-20 w-16 rounded-lg border-2 border-primary-100 object-contain"
                />
                <span className="max-w-16 truncate text-sm text-primary-600">
                  {frame.name}
                </span>
                {frame.custom && (
                  <button
                    type="button"
                    onClick={() => removeFrame(frame.id)}
                    className="text-sm font-semibold text-accent-600"
                  >
                    Hapus
                  </button>
                )}
              </div>
            ))}
          </div>
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
