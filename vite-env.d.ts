/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Default displayed price in IDR (string from env, parsed to number). */
  readonly VITE_DEFAULT_PRICE?: string;
  /** Default 4-digit ADMIN PIN (unlocks the admin panel). */
  readonly VITE_DEFAULT_ADMIN_PIN?: string;
  /** Default 4-digit OPERATOR PIN (confirms the "Sudah Bayar" payment gate). */
  readonly VITE_DEFAULT_OPERATOR_PIN?: string;
  /** Sender email used by the Resend serverless function. */
  readonly VITE_SENDER_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
