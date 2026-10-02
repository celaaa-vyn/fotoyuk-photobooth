/**
 * Core shared types for the photobooth kiosk.
 * These describe the flow state machine, persisted history, frame assets,
 * the offline email queue, and admin-configurable settings.
 */

/** The six mandatory flow steps, plus the PIN-protected admin screen. */
export type KioskStep =
  | 'welcome'
  | 'payment'
  | 'camera'
  | 'frame'
  | 'email'
  | 'thankyou'
  | 'admin';

/** A single captured photo as a data URL (un-mirrored, full resolution). */
export type CapturedPhoto = {
  id: string;
  /** JPEG/PNG data URL of the captured frame (not mirrored). */
  dataUrl: string;
  takenAt: number;
};

/** A selectable frame overlay (transparent PNG) from the gallery. */
export type FrameAsset = {
  id: string;
  name: string;
  /** URL/path or data URL of the transparent PNG overlay. */
  src: string;
  /** Layout the frame is designed for. Vertical 2x6 strip is the default. */
  layout: 'strip-2x6';
  /** Whether this frame was uploaded via admin (stored in localStorage). */
  custom?: boolean;
};

/** Delivery status of a photobooth session's final email. */
export type EmailStatus = 'pending' | 'sent' | 'failed';

/** A transaction record kept in localStorage and exportable as CSV. */
export type Transaction = {
  id: string;
  createdAt: number;
  email: string;
  /** Price shown/charged at the time of the session (in IDR). */
  price: number;
  frameId: string | null;
  emailStatus: EmailStatus;
  /** Number of send attempts made for the final image. */
  attempts: number;
};

/** A final composited image queued for sending while offline or after failure. */
export type QueuedEmail = {
  id: string;
  /** Associated transaction id, if any. */
  transactionId: string | null;
  email: string;
  /** Final composited image as a data URL (base64). */
  imageDataUrl: string;
  filename: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
};

/** Admin-configurable kiosk settings persisted in localStorage. */
export type Settings = {
  /** Displayed price in IDR. */
  price: number;
  /**
   * 4-digit ADMIN PIN. Unlocks the admin panel (price/QRIS/frame edits, PIN
   * changes, full transaction history + CSV export). This is a higher trust
   * level than the operator PIN and should NOT be shown to guests.
   */
  adminPin: string;
  /**
   * 4-digit OPERATOR PIN. Confirms the "Sudah Bayar" payment gate on the
   * payment screen. The operator types this in front of guests on every
   * session, so it is deliberately a SEPARATE secret from adminPin: leaking it
   * only advances the flow, it does not expose the admin panel.
   */
  operatorPin: string;
  /** Data URL or path of the static QRIS image shown on the payment screen. */
  qrisImage: string | null;
  /** Sender email used by the Resend serverless function. */
  senderEmail: string;
  /** Frame overlays available in the gallery (seeded + admin uploads). */
  frames: FrameAsset[];
};
