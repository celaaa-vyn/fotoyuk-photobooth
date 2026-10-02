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
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';

/** Pragmatic email format check (mirrors the client-side validation). */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
      : 'photobooth-strip.jpg';

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
