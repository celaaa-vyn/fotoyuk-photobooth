# FotoYuk

Portable photobooth web app optimized for **iPad Pro M1 11" (Safari, landscape, touch)**.
Built as an installable PWA so it runs full-screen as an event kiosk. The budget target is
zero / near-zero using free tiers only (**Vercel** hosting + **Resend** email).

The flow is deliberately simple so guests can self-serve and an operator only steps in to
confirm payment:

1. **Welcome** – one big "Mulai" button + short instruction ("bayar dulu ke QRIS, lalu panggil operator").
2. **Payment** – shows a static QRIS image and the price. The guest scans and pays with their own phone; the operator checks the payment notification and taps **"Sudah Bayar"**, which is protected by the 4-digit **operator PIN** (separate from the admin PIN). A **Batal** button returns to Welcome.
3. **Camera** – front camera (`facingMode: "user"`), 3-second countdown, captures **exactly 4 photos** in a row with a per-photo preview and one retake.
4. **Frame** – gallery of transparent PNG frames; the guest swipes and picks one, with a live preview of the composite. The main output is a **parametric vertical strip** (2×6-style layout).
5. **Email** – the guest types their email (format-validated, the iPad keyboard pops up automatically); the final image is sent as an **attachment**.
6. **Thank you** – thank-you message, auto-reset to Welcome after 10 seconds, and the transaction is logged.

## Tech stack

- React 18 + Vite + TypeScript
- TailwindCSS (playful bright theme, large touch targets, large fonts)
- Zustand for the 6-step flow state machine
- `vite-plugin-pwa` (full-screen, landscape manifest + service worker)
- One Vercel serverless function for email (Resend free tier)
- HTML Canvas compositing on the client (photos + frame → high-quality JPG/PNG)
- No database and **no server-side photo storage**

## Key behaviours

- **Exactly 4 photos** are captured per session.
- The final image is a **parametric vertical strip** - the strip dimensions, gaps and photo
  cells are computed in code (`src/utils/compositePhoto.ts`), so the layout scales cleanly
  and the frame overlay is drawn on top.
- The **live preview is mirrored** (`transform: scaleX(-1)`) so it feels natural, but the
  **saved/composited photos are NOT mirrored**, so any text on the frame stays readable.
- **Photos are never stored server-side.** The composite image is sent straight to Resend as
  an email attachment by the serverless function and then dropped. There is no database.
- **Transaction history** (timestamp, email, price, frame, email status) is kept only in the
  browser's `localStorage` and can be exported to **CSV** from the admin panel.
- **Offline-tolerant email**: if the kiosk is offline (or a send fails), the email is queued
  in `localStorage` and sent automatically when connectivity returns.

## Project structure

```
photobooth-kiosk/
├─ api/
│  ├─ send-email.ts         # Vercel serverless function (Resend email send)
│  └─ tsconfig.json         # type-check config for the function
├─ public/
│  ├─ frames/               # Transparent PNG frame overlays
│  ├─ qris-placeholder.png  # Default QRIS image (replace in admin)
│  ├─ icon-192.png          # PWA icons
│  └─ icon-512.png
├─ src/
│  ├─ components/
│  │  ├─ screens/           # welcome, payment, camera, frame, email, thankyou, admin
│  │  └─ ui/                # reusable touch widgets (big buttons, PIN pad, progress bar)
│  ├─ hooks/                # useCamera, useWakeLock, useEmailQueue
│  ├─ store/                # Zustand kiosk store (+ localStorage persistence)
│  ├─ utils/                # canvas compositing, CSV export, email client
│  ├─ types/                # shared TypeScript types
│  ├─ App.tsx
│  ├─ main.tsx
│  └─ index.css
├─ index.html               # iPad meta: no zoom, safe-area, apple-mobile-web-app
├─ vite.config.ts
├─ tailwind.config.js
├─ postcss.config.js
├─ tsconfig.json
├─ vercel.json
└─ .env.example
```

## Prerequisites

- **Node 18+** (developed on Node 22) and npm.
- A free [Resend](https://resend.com) account for the email API key.
- A free [Vercel](https://vercel.com) account for hosting.

## Install

```bash
npm install
```

## Environment variables

Copy the example file and fill it in for local development; set the same values in the
Vercel dashboard for production:

```bash
cp .env.example .env
```

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | **Server only** | _(blank)_ | Resend API key used by the serverless email function. Get it from the Resend dashboard (free tier). Set it in **Vercel -> Settings -> Environment Variables**; it is read via `process.env` on the server and **never shipped to the browser**. Never commit a real key. |
| `SEND_EMAIL_SECRET` | **Server only** | _(blank)_ | Optional shared secret for `/api/send-email`. Leave blank to rely on the built-in same-origin check + rate limit (the normal kiosk setup). If set, callers must send it as the `x-kiosk-secret` header. **Do not** prefix it with `VITE_` and never ship it to the browser; it only helps server-to-server callers, not the static kiosk bundle. |
| `VITE_SENDER_EMAIL` | Client | `onboarding@resend.dev` | From-address for outgoing photo emails. The default works out of the box on the Resend free tier. To send from your own domain, verify it in Resend and set this to an address on that verified domain. |
| `VITE_DEFAULT_ADMIN_PIN` | Client | `2802` | Default 4-digit **admin** PIN. Unlocks the admin panel (price/QRIS/frame edits, PIN changes, transaction history + CSV). Keep it private. Can be changed later in the admin panel. |
| `VITE_DEFAULT_OPERATOR_PIN` | Client | `1111` | Default 4-digit **operator** PIN. Confirms the "Sudah Bayar" payment gate. This is a **separate** secret from the admin PIN (the operator types it in front of guests), so leaking it only advances the flow and never exposes the admin panel. Can be changed later in the admin panel. |
| `VITE_DEFAULT_PRICE` | Client | `25000` | Default displayed price in IDR. Can be changed later in the admin panel. |

> `VITE_*` variables are embedded into the client bundle at build time - do not put secrets
> in them. The server-only secrets (`RESEND_API_KEY`, optional `SEND_EMAIL_SECRET`) stay
> server-side and are never shipped to the browser.

### Email endpoint abuse protection

`/api/send-email` is public by nature (the kiosk is a static client that calls it), so it is
protected without any database:

- **Same-origin check** - requests whose `Origin`/`Referer` host is not the deployment's own
  host are rejected (403). Browsers cannot forge these headers from another site, so this
  blocks cross-site abuse while the kiosk (same origin) keeps working.
- **Per-IP rate limit** - a coarse in-memory sliding window (10 requests / minute per warm
  instance) throttles bursts and returns 429 when exceeded. It is best-effort (serverless
  instances are ephemeral), not a global quota.
- **Optional shared secret** - set `SEND_EMAIL_SECRET` (server only) to additionally require
  the `x-kiosk-secret` header. Because any value shipped to the static client bundle is not
  secret, this is only useful for server-to-server callers, not the kiosk itself.

## Run locally

```bash
npm run dev        # start the Vite dev server (http://localhost:5173)
npm run build      # type-check (app + api) + production build into dist/
npm run preview    # serve the production build locally
npm run typecheck  # TypeScript type-check only (app + api)
```

> The camera (`getUserMedia`) requires **HTTPS**. It works on `http://localhost` for
> development, but on the iPad you must open an **HTTPS** URL (deploy to Vercel - see below).
> Email sending also needs the serverless function, which runs on Vercel (or `vercel dev`).

## Deploy to Vercel

1. Push this project to a Git repository (GitHub/GitLab/Bitbucket) and **Import** it in the
   Vercel dashboard, or run the Vercel CLI from the project root.
2. Vercel auto-detects **Vite**. The build command is `npm run build` and the output
   directory is `dist` (both pinned in `vercel.json`). The `api/` folder is deployed as
   serverless functions automatically, so `POST /api/send-email` is live.
3. In **Project → Settings → Environment Variables**, add:
   - `RESEND_API_KEY` (**required** - your Resend key),
   - optionally `SEND_EMAIL_SECRET`, `VITE_SENDER_EMAIL`, `VITE_DEFAULT_ADMIN_PIN`,
     `VITE_DEFAULT_OPERATOR_PIN`, `VITE_DEFAULT_PRICE` if you want non-default values.
4. **Deploy.** Vercel serves over **HTTPS automatically**, which satisfies the camera
   requirement - no extra certificate setup needed.

## Testing on the iPad

1. Open the deployed **HTTPS** URL in **Safari** on the iPad Pro. (HTTPS is required for the
   camera to work; `http://` will not grant camera access.)
2. Rotate to **landscape**.
3. Tap **Share → Add to Home Screen**, then launch FotoYuk from the Home Screen. This runs it
   full-screen with no Safari chrome (PWA display mode `fullscreen`).
4. **Grant camera permission** when prompted. If you accidentally denied it:
   **Settings → Safari → Camera → Allow** (or, for the installed PWA, tap the camera prompt
   again / reinstall). The app also shows in-app instructions if access is blocked.
5. For a locked-down event kiosk, enable **Guided Access**
   (**Settings → Accessibility → Guided Access**, turn it on and set a passcode). While the
   app is open, **triple-click the top/side button** to start Guided Access so guests cannot
   leave FotoYuk. Triple-click again and enter the passcode to exit.
6. The screen is kept awake automatically via the **Screen Wake Lock API** while the app is
   active (re-acquired when you return to the app). You can also disable Auto-Lock in
   **Settings → Display & Brightness → Auto-Lock → Never** as a belt-and-braces measure.

### iPad / kiosk optimizations baked in

- Zoom disabled (`user-scalable=no`, `maximum-scale=1`) and pull-to-refresh disabled
  (`overscroll-behavior-y: none`).
- `viewport-fit=cover` + safe-area-inset padding so controls avoid the notch/home indicator
  in landscape.
- `apple-mobile-web-app-capable` + status-bar meta for full-screen standalone launch.
- `touch-action: manipulation` to remove double-tap zoom and tap delay.
- All primary touch targets are **≥56px** with large, readable fonts.

## Admin panel

The admin panel is PIN-gated and reached via a discreet affordance on the Welcome screen.
It uses the **admin PIN**, which is deliberately **separate** from the **operator PIN** that
confirms the "Sudah Bayar" payment gate. This way the operator can type the operator PIN in
front of guests on every session without exposing admin access. Changing one PIN does not
change the other.

1. Open the admin entry from the Welcome screen and enter the **admin PIN** (**default `2802`**,
   or your `VITE_DEFAULT_ADMIN_PIN`).
2. From there you can:
   - **Set the displayed price** (IDR).
   - **Upload the static QRIS image** shown on the payment screen.
   - **Upload new frame PNGs** (transparent overlays) for the frame gallery.
   - **Change the admin PIN** (unlocks this panel) and the **operator PIN** (payment gate)
     independently.
   - **View transaction history** and **export it to CSV**.

> The default operator PIN is `1111` (`VITE_DEFAULT_OPERATOR_PIN`). Change both PINs from the
> defaults before a real event.

Settings, uploaded images, frames and history are stored in the browser's `localStorage` on
that iPad, so they persist across reloads but stay on the device.

## Troubleshooting

- **Camera won't start / permission denied** – make sure you are on an **HTTPS** URL and have
  allowed camera access (Settings → Safari → Camera). The capture screen shows how to re-enable.
- **Email not arriving** – confirm `RESEND_API_KEY` is set in Vercel and that
  `VITE_SENDER_EMAIL` is either `onboarding@resend.dev` or an address on a Resend-verified
  domain. Failed/offline sends are queued and retried automatically; the email screen offers a
  manual "Kirim Ulang" and a "Lanjut" so the guest is never stuck.
- **Guest left the app** – enable Guided Access as described above.
