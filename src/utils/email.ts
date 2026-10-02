/**
 * Client-side email helper.
 *
 * Posts the final composited image (as base64, without the data-URL prefix) and
 * the recipient address to the Vercel serverless function at /api/send-email,
 * which sends it via Resend as an attachment. The RESEND_API_KEY lives only on
 * the server; this helper never sees it.
 */

export type SendEmailParams = {
  /** Recipient email address. */
  to: string;
  /** Final image as a base64 string (no `data:` prefix) OR a full data URL. */
  imageBase64: string;
  /** Attachment filename, e.g. "fotoyuk-strip.jpg". */
  filename: string;
};

export type SendEmailResult = {
  ok: boolean;
  /** Error message when ok is false. */
  error?: string;
};

/** Endpoint for the serverless email function (same origin on Vercel). */
const ENDPOINT = '/api/send-email';

/** Strip a leading `data:...;base64,` prefix so we always send raw base64. */
export function stripDataUrlPrefix(input: string): string {
  const comma = input.indexOf(',');
  return input.startsWith('data:') && comma !== -1 ? input.slice(comma + 1) : input;
}

/**
 * Attempt to send the final photo by email. Resolves with { ok: true } on a
 * 2xx response, otherwise { ok: false, error } so callers can enqueue + retry.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const body = {
    to: params.to,
    imageBase64: stripDataUrlPrefix(params.imageBase64),
    filename: params.filename,
  };

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) detail = data.error;
      } catch {
        /* response was not JSON — keep the HTTP status as the detail. */
      }
      return { ok: false, error: detail };
    }

    return { ok: true };
  } catch (err) {
    // Network failure (offline, DNS, CORS, etc.).
    const message = err instanceof Error ? err.message : 'Gagal mengirim email.';
    return { ok: false, error: message };
  }
}

export default sendEmail;
