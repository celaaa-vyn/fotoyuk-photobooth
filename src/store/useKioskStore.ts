/**
 * Central Zustand store: single source of truth for the 6-step kiosk flow.
 *
 * It owns the current step, the photos captured this session, the selected
 * frame, the entered email, admin-configurable settings, the transaction
 * history, and the offline email queue.
 *
 * Settings / transactions / emailQueue are persisted to localStorage so they
 * survive reloads (the kiosk may be force-refreshed between sessions). Defaults
 * for settings come from Vite env vars (VITE_DEFAULT_PRICE / VITE_DEFAULT_ADMIN_PIN
 * / VITE_SENDER_EMAIL) and are overridden by any values found in localStorage.
 */
import { create } from 'zustand';
import type {
  CapturedPhoto,
  FrameAsset,
  KioskStep,
  QueuedEmail,
  Settings,
  Transaction,
} from '../types';

/* localStorage keys. Namespaced so they don't collide with other apps. */
const LS_SETTINGS = 'pbk.settings';
const LS_TRANSACTIONS = 'pbk.transactions';
const LS_EMAIL_QUEUE = 'pbk.emailQueue';

/** Default frames seeded from the public/frames gallery (placeholder PNGs). */
const DEFAULT_FRAMES: FrameAsset[] = [
  { id: 'frame-classic', name: 'Classic', src: '/frames/frame-classic.png', layout: 'strip-2x6' },
  { id: 'frame-party', name: 'Party', src: '/frames/frame-party.png', layout: 'strip-2x6' },
  { id: 'frame-polaroid', name: 'Polaroid', src: '/frames/frame-polaroid.png', layout: 'strip-2x6' },
];

/** Parse the env price into a safe positive integer, falling back to 25000. */
function defaultPrice(): number {
  const raw = import.meta.env.VITE_DEFAULT_PRICE;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 25000;
}

/** Base settings from env before localStorage overrides are applied. */
function envSettings(): Settings {
  return {
    price: defaultPrice(),
    adminPin: import.meta.env.VITE_DEFAULT_ADMIN_PIN ?? '2802',
    qrisImage: null,
    senderEmail: import.meta.env.VITE_SENDER_EMAIL ?? 'onboarding@resend.dev',
    frames: DEFAULT_FRAMES,
  };
}

/** Safely read + parse a JSON value from localStorage. */
function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Safely write a JSON value to localStorage (ignores quota/availability errors). */
function writeJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* localStorage may be unavailable (private mode / full) — fail silently. */
  }
}

/** Merge env defaults with any persisted overrides so new fields keep defaults. */
function hydrateSettings(): Settings {
  const base = envSettings();
  const stored = readJSON<Partial<Settings> | null>(LS_SETTINGS, null);
  if (!stored) return base;
  return {
    ...base,
    ...stored,
    // Ensure frames always exist even if an older persisted shape omitted them.
    frames: stored.frames && stored.frames.length > 0 ? stored.frames : base.frames,
  };
}

export type KioskState = {
  /** Current flow step rendered by App. */
  step: KioskStep;
  /** Photos captured this session (un-mirrored data URLs). */
  capturedPhotos: CapturedPhoto[];
  /** Id of the frame chosen on the frame screen. */
  selectedFrameId: string | null;
  /** Final composited strip (photos + frame) as a data URL, set on the frame screen. */
  compositeDataUrl: string | null;
  /** Email entered by the user on the email screen. */
  email: string;
  /** Admin-configurable settings (persisted). */
  settings: Settings;
  /** Transaction history (persisted). */
  transactions: Transaction[];
  /** Offline / retry email queue (persisted). */
  emailQueue: QueuedEmail[];

  /* ---- navigation ---- */
  goTo: (step: KioskStep) => void;
  /** Clear per-session data and return to welcome. */
  reset: () => void;

  /* ---- session data ---- */
  setPhotos: (photos: CapturedPhoto[]) => void;
  setFrame: (frameId: string | null) => void;
  setComposite: (dataUrl: string | null) => void;
  setEmail: (email: string) => void;

  /* ---- settings mutators (admin) ---- */
  setPrice: (price: number) => void;
  setAdminPin: (pin: string) => void;
  setQrisImage: (dataUrl: string | null) => void;
  addFrame: (frame: FrameAsset) => void;
  removeFrame: (frameId: string) => void;

  /* ---- history / queue ---- */
  addTransaction: (tx: Transaction) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  clearTransactions: () => void;
  enqueueEmail: (item: QueuedEmail) => void;
  dequeueEmail: (id: string) => void;
  updateQueuedEmail: (id: string, patch: Partial<QueuedEmail>) => void;
};

export const useKioskStore = create<KioskState>((set) => ({
  step: 'welcome',
  capturedPhotos: [],
  selectedFrameId: null,
  compositeDataUrl: null,
  email: '',
  settings: hydrateSettings(),
  transactions: readJSON<Transaction[]>(LS_TRANSACTIONS, []),
  emailQueue: readJSON<QueuedEmail[]>(LS_EMAIL_QUEUE, []),

  goTo: (step) => set({ step }),

  reset: () =>
    set({
      step: 'welcome',
      capturedPhotos: [],
      selectedFrameId: null,
      compositeDataUrl: null,
      email: '',
    }),

  setPhotos: (capturedPhotos) => set({ capturedPhotos }),
  setFrame: (selectedFrameId) => set({ selectedFrameId }),
  setComposite: (compositeDataUrl) => set({ compositeDataUrl }),
  setEmail: (email) => set({ email }),

  setPrice: (price) =>
    set((s) => {
      const settings = { ...s.settings, price };
      writeJSON(LS_SETTINGS, settings);
      return { settings };
    }),

  setAdminPin: (adminPin) =>
    set((s) => {
      const settings = { ...s.settings, adminPin };
      writeJSON(LS_SETTINGS, settings);
      return { settings };
    }),

  setQrisImage: (qrisImage) =>
    set((s) => {
      const settings = { ...s.settings, qrisImage };
      writeJSON(LS_SETTINGS, settings);
      return { settings };
    }),

  addFrame: (frame) =>
    set((s) => {
      const settings = { ...s.settings, frames: [...s.settings.frames, frame] };
      writeJSON(LS_SETTINGS, settings);
      return { settings };
    }),

  removeFrame: (frameId) =>
    set((s) => {
      const settings = {
        ...s.settings,
        frames: s.settings.frames.filter((f) => f.id !== frameId),
      };
      writeJSON(LS_SETTINGS, settings);
      return { settings };
    }),

  addTransaction: (tx) =>
    set((s) => {
      const transactions = [tx, ...s.transactions];
      writeJSON(LS_TRANSACTIONS, transactions);
      return { transactions };
    }),

  updateTransaction: (id, patch) =>
    set((s) => {
      const transactions = s.transactions.map((t) =>
        t.id === id ? { ...t, ...patch } : t,
      );
      writeJSON(LS_TRANSACTIONS, transactions);
      return { transactions };
    }),

  clearTransactions: () =>
    set(() => {
      writeJSON(LS_TRANSACTIONS, []);
      return { transactions: [] };
    }),

  enqueueEmail: (item) =>
    set((s) => {
      const emailQueue = [...s.emailQueue, item];
      writeJSON(LS_EMAIL_QUEUE, emailQueue);
      return { emailQueue };
    }),

  dequeueEmail: (id) =>
    set((s) => {
      const emailQueue = s.emailQueue.filter((q) => q.id !== id);
      writeJSON(LS_EMAIL_QUEUE, emailQueue);
      return { emailQueue };
    }),

  updateQueuedEmail: (id, patch) =>
    set((s) => {
      const emailQueue = s.emailQueue.map((q) =>
        q.id === id ? { ...q, ...patch } : q,
      );
      writeJSON(LS_EMAIL_QUEUE, emailQueue);
      return { emailQueue };
    }),
}));
