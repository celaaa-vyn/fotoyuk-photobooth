/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Default displayed price in IDR (string from env, parsed to number). */
  readonly VITE_DEFAULT_PRICE?: string;
  /** Default 4-digit admin/operator PIN. */
  readonly VITE_DEFAULT_ADMIN_PIN?: string;
  /** Sender email used by the Resend serverless function. */
  readonly VITE_SENDER_EMAIL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
