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

/**
 * One photo area ("slot") inside a frame, described in RESOLUTION-INDEPENDENT
 * relative units in the range 0..1 so a frame definition is independent of the
 * final export pixel size. A frame carries an ordered list of these slots; the
 * first captured photo fills slot[0], the second fills slot[1], and so on.
 */
export type FrameSlot = {
  /** Stable identifier for this slot (e.g. 'slot-0'). */
  id: string;
  /** Slot top-left X as a fraction of the frame canvas width (0..1). */
  x: number;
  /** Slot top-left Y as a fraction of the frame canvas height (0..1). */
  y: number;
  /** Slot width as a fraction of the frame canvas width (0..1). */
  width: number;
  /** Slot height as a fraction of the frame canvas height (0..1). */
  height: number;
  /** Photo scale multiplier inside the slot (>= 1 typical, default 1). */
  zoom: number;
  /** Photo horizontal pan inside the slot, in slot-relative units (default 0). */
  offsetX: number;
  /** Photo vertical pan inside the slot, in slot-relative units (default 0). */
  offsetY: number;
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
  /**
   * Optional photo-area definitions in relative 0..1 units. Frames WITHOUT
   * slots (e.g. older persisted uploads) fall back to the legacy strip grid
   * in compositePhoto, so this field is purely additive and backward
   * compatible.
   */
  slots?: FrameSlot[];
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
