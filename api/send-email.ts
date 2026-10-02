/**
 * Vercel serverless function: POST /api/send-email
 *
 * Sends the final photobooth strip to the user as an email ATTACHMENT via
 * Resend. This is the ONLY place the Resend API key is used — it is read from
 * process.env.RESEND_API_KEY on the server and is NEVER shipped to the client
 * bundle. There is no database and nothing is stored server-side: the image is
 * forwarded straight to Resend and then dropped.
 *
 * Request body (JSON): { to: string, imageBase64: string, filename: string }
 * Response (JSON): { ok: true, id } on success, { ok: false, error } on failure.
 *
 * Abuse mitigation (issue 1). On a public Vercel URL this endpoint would
 * otherwise be an open relay: anyone could POST attachments and drain the
 * free-tier Resend quota, taking the kiosk offline. Because the kiosk is a
 * static client bundle, there is NO secret we can ship to it that stays secret
 * (every VITE_* value is embedded in the bundle), so a client-sent shared
 * secret would be security theatre. The effective, database-free mitigations
 * used here are:
 *   1. Same-origin check: reject requests whose Origin/Referer host is not the
 *      deployment's own host. Browsers set these headers and cannot be told to
 *      forge them from another site, so this blocks cross-site abuse from a
 *      browser while leaving the kiosk (same origin) working.
 *   2. Coarse per-IP rate limit: a small in-memory sliding window per serverless
 *      instance caps burst abuse without any datastore. It is best-effort
 *      (instances are ephemeral and not shared) but meaningfully slows a single
 *      source hammering one instance.
 * An OPTIONAL server-only shared secret (SEND_EMAIL_SECRET, compared in constant
 * time) is also honoured when set. It is NOT a VITE_ var and must never be
 * shipped to the client; it is only useful for server-to-server callers.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { timingSafeEqual } from 'node:crypto';

/** Pragmatic email format check (mirrors the client-side validation). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Per-IP rate limit: at most this many requests within the window below. */
const RATE_LIMIT_MAX = 10;
/** Rate-limit sliding window in milliseconds. */
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * In-memory per-IP request timestamps. Scoped to a single warm serverless
 * instance (ephemeral, not shared across instances), so this is best-effort
 * burst protection, not a global quota. No datastore involved.
 */
const rateBuckets = new Map<string, number[]>();

/** Record a hit for `ip` and return true if it is now over the limit. */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const hits = (rateBuckets.get(ip) ?? []).filter((t) => t > windowStart);
  hits.push(now);
  rateBuckets.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

/** Best-effort client IP from standard proxy headers. */
function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  if (raw) return raw.split(',')[0]!.trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/** Extract the host from an Origin or Referer header value. */
function headerHost(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/**
 * Same-origin guard. Returns true when the request appears to originate from
 * the deployment's own host (or when no Origin/Referer is present, e.g. a
 * server-to-server caller that passed the optional shared secret). Rejects a
 * browser request whose Origin/Referer host differs from the deployment host.
 */
function isSameOrigin(req: VercelRequest): boolean {
  const selfHost =
    (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host) ?? null;
  const originHost = headerHost(req.headers.origin);
  const refererHost = headerHost(req.headers.referer);
  // No browser-set origin info at all: allow (covers same-origin fetches that
  // omit Origin and legitimate server-to-server callers); other guards still
  // apply (rate limit + optional shared secret).
  if (!originHost && !refererHost) return true;
  if (!selfHost) return false;
  if (originHost && originHost !== selfHost) return false;
  if (refererHost && refererHost !== selfHost) return false;
  return true;
}

/** Constant-time string compare that tolerates length differences. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validate the OPTIONAL server-only shared secret. Returns true when no secret
 * is configured (feature off) or when the provided header matches. This secret
 * must NOT be a VITE_ var and must never be shipped to the browser.
 */
function sharedSecretOk(req: VercelRequest): boolean {
  const expected = process.env.SEND_EMAIL_SECRET;
  if (!expected) return true;
  const headerRaw = req.headers['x-kiosk-secret'];
  const provided = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
  return typeof provided === 'string' && safeEqual(provided, expected);
}

/** Resolve the sender address from env, defaulting to Resend's sandbox sender. */
function senderEmail(): string {
  return (
    process.env.SENDER_EMAIL ??
    process.env.VITE_SENDER_EMAIL ??
    'onboarding@resend.dev'
  );
}

type SendEmailBody = {
  to?: unknown;
  imageBase64?: unknown;
  filename?: unknown;
};

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    return;
  }

  // Abuse mitigation (issue 1): reject cross-site browser callers, honour the
  // optional server-only shared secret, and apply a coarse per-IP rate limit.
  if (!isSameOrigin(req)) {
    res.status(403).json({ ok: false, error: 'Origin tidak diizinkan.' });
    return;
  }
  if (!sharedSecretOk(req)) {
    res.status(401).json({ ok: false, error: 'Akses tidak sah.' });
    return;
  }
  if (isRateLimited(clientIp(req))) {
    res.setHeader('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
    res.status(429).json({ ok: false, error: 'Terlalu banyak permintaan, coba lagi nanti.' });
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({ ok: false, error: 'RESEND_API_KEY belum dikonfigurasi.' });
    return;
  }

  // Vercel parses JSON bodies automatically, but guard against string bodies.
  let body: SendEmailBody;
  try {
    body = typeof req.body === 'string' ? (JSON.parse(req.body) as SendEmailBody) : (req.body as SendEmailBody);
  } catch {
    res.status(400).json({ ok: false, error: 'Body JSON tidak valid.' });
    return;
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const filename =
    typeof body.filename === 'string' && body.filename.trim().length > 0
      ? body.filename.trim()
      : 'fotoyuk-strip.jpg';

  // Server-side validation of inputs.
  if (!EMAIL_REGEX.test(to)) {
    res.status(400).json({ ok: false, error: 'Alamat email tidak valid.' });
    return;
  }
  if (!imageBase64) {
    res.status(400).json({ ok: false, error: 'Gambar tidak ditemukan.' });
    return;
  }

  // Strip any accidental data-URL prefix so we send pure base64 to Resend.
  const comma = imageBase64.indexOf(',');
  const base64 =
    imageBase64.startsWith('data:') && comma !== -1
      ? imageBase64.slice(comma + 1)
      : imageBase64;

  const resend = new Resend(apiKey);

  try {
    const { data, error } = await resend.emails.send({
      from: senderEmail(),
      to,
      subject: 'Foto Photobooth Kamu 📸',
      html:
        '<p>Terima kasih sudah mampir ke photobooth kami!</p>' +
        '<p>Hasil fotonya terlampir. Sampai jumpa lagi! 🎉</p>',
      attachments: [
        {
          filename,
          content: base64,
        },
      ],
    });

    if (error) {
      res.status(502).json({ ok: false, error: error.message });
      return;
    }

    res.status(200).json({ ok: true, id: data?.id ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gagal mengirim email.';
    res.status(502).json({ ok: false, error: message });
  }
}
