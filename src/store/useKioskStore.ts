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
 * / VITE_DEFAULT_OPERATOR_PIN / VITE_SENDER_EMAIL) and are overridden by any
 * values found in localStorage.
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

/**
 * Hard cap on how many emails we persist in the offline queue. Each item
 * carries a full base64 strip (~1-2MB), so an unbounded queue would blow the
 * ~5MB localStorage budget during a long offline stretch and silently drop
 * writes. When the cap is exceeded we evict the OLDEST items (issue 5).
 */
const MAX_QUEUE_LENGTH = 8;

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
    operatorPin: import.meta.env.VITE_DEFAULT_OPERATOR_PIN ?? '2802',
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

/**
 * Safely write a JSON value to localStorage. Returns true on success and false
 * when the write failed (quota exceeded / private mode / unavailable), so the
 * caller can surface persistence failure instead of silently losing data.
 */
function writeJSON(key: string, value: unknown): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    /* localStorage may be unavailable (private mode / full) - report failure. */
    return false;
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
    // Backward compatibility: older persisted settings (pre operator-PIN split)
    // have no operatorPin. Fall back to the env default so the payment gate
    // keeps working instead of validating against an empty string (issue 2).
    operatorPin:
      typeof stored.operatorPin === 'string' && stored.operatorPin.length > 0
        ? stored.operatorPin
        : base.operatorPin,
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
  /**
   * Delivery outcome of this session's email, used by the thank-you screen so
   * its message reflects reality (issue 4):
   *  - 'sent'   : delivered immediately
   *  - 'queued' : offline / failed, placed on the retry queue
   *  - null     : not yet attempted
   */
  emailOutcome: 'sent' | 'queued' | null;
  /** Admin-configurable settings (persisted). */
  settings: Settings;
  /** Transaction history (persisted). */
  transactions: Transaction[];
  /** Offline / retry email queue (persisted). */
  emailQueue: QueuedEmail[];
  /**
   * True when the last email-queue write to localStorage failed (quota full /
   * storage unavailable), so the UI can warn that a queued photo may not
   * survive a reload (issue 5).
   */
  queuePersistError: boolean;

  /* ---- navigation ---- */
  goTo: (step: KioskStep) => void;
  /** Clear per-session data and return to welcome. */
  reset: () => void;

  /* ---- session data ---- */
  setPhotos: (photos: CapturedPhoto[]) => void;
  setFrame: (frameId: string | null) => void;
  setComposite: (dataUrl: string | null) => void;
  setEmail: (email: string) => void;
  setEmailOutcome: (outcome: 'sent' | 'queued' | null) => void;

  /* ---- settings mutators (admin) ---- */
  setPrice: (price: number) => void;
  setAdminPin: (pin: string) => void;
  setOperatorPin: (pin: string) => void;
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
  emailOutcome: null,
  settings: hydrateSettings(),
  transactions: readJSON<Transaction[]>(LS_TRANSACTIONS, []),
  emailQueue: readJSON<QueuedEmail[]>(LS_EMAIL_QUEUE, []),
  queuePersistError: false,

  goTo: (step) => set({ step }),

  reset: () =>
    set({
      step: 'welcome',
      capturedPhotos: [],
      selectedFrameId: null,
      compositeDataUrl: null,
      email: '',
      emailOutcome: null,
    }),

  setPhotos: (capturedPhotos) => set({ capturedPhotos }),
  setFrame: (selectedFrameId) => set({ selectedFrameId }),
  setComposite: (compositeDataUrl) => set({ compositeDataUrl }),
  setEmail: (email) => set({ email }),
  setEmailOutcome: (emailOutcome) => set({ emailOutcome }),

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

  setOperatorPin: (operatorPin) =>
    set((s) => {
      const settings = { ...s.settings, operatorPin };
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
      // Cap the queue so a long offline stretch cannot blow the localStorage
      // budget: keep only the most recent MAX_QUEUE_LENGTH items, evicting the
      // oldest (issue 5).
      const appended = [...s.emailQueue, item];
      const emailQueue =
        appended.length > MAX_QUEUE_LENGTH
          ? appended.slice(appended.length - MAX_QUEUE_LENGTH)
          : appended;
      const ok = writeJSON(LS_EMAIL_QUEUE, emailQueue);
      return { emailQueue, queuePersistError: !ok };
    }),

  dequeueEmail: (id) =>
    set((s) => {
      const emailQueue = s.emailQueue.filter((q) => q.id !== id);
      const ok = writeJSON(LS_EMAIL_QUEUE, emailQueue);
      // A successful shrink clears any prior persistence error.
      return { emailQueue, queuePersistError: ok ? false : s.queuePersistError };
    }),

  updateQueuedEmail: (id, patch) =>
    set((s) => {
      const emailQueue = s.emailQueue.map((q) =>
        q.id === id ? { ...q, ...patch } : q,
      );
      const ok = writeJSON(LS_EMAIL_QUEUE, emailQueue);
      return { emailQueue, queuePersistError: !ok };
    }),
}));
