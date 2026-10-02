# Photobooth Kiosk

Portable photobooth web app optimized for **iPad Pro M1 11" (Safari, landscape, touch)**.
Built as an installable PWA so it can run full-screen as an event kiosk. Budget target is
zero / near-zero using free tiers (Vercel hosting + Resend email).

> Status: project scaffold and build baseline (FEAT-001). The full six-step kiosk flow,
> camera capture, frame compositing, email sending, admin panel, and offline queue are
> implemented in later features.

## Tech stack

- React 18 + Vite + TypeScript
- TailwindCSS (playful bright theme, large touch targets)
- Zustand for flow state
- `vite-plugin-pwa` (full-screen, landscape manifest + service worker)
- One Vercel serverless function for email (Resend free tier) — added in a later feature
- No database, no server-side photo storage

## Project structure

```
photobooth-kiosk/
├─ api/                     # Vercel serverless function(s) (email send)
├─ public/
│  ├─ frames/               # Transparent PNG frame overlays
│  ├─ icon-192.png          # PWA icons
│  └─ icon-512.png
├─ src/
│  ├─ components/
│  │  ├─ screens/           # welcome, payment, camera, frame, email, thankyou, admin
│  │  └─ ui/                # reusable touch widgets (big buttons, PIN pad, progress)
│  ├─ hooks/                # camera, wake lock, email queue, online/offline
│  ├─ store/                # Zustand kiosk store
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

## Install

Requires Node 18+ (developed on Node 22) and npm.

```bash
npm install
```

## Environment variables

Copy `.env.example` to `.env` for local development and set values in the Vercel
dashboard for production.

| Variable | Scope | Default | Purpose |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | Server only | _(blank)_ | Resend API key used by the serverless email function. Set in Vercel, never commit. |
| `VITE_SENDER_EMAIL` | Client | `onboarding@resend.dev` | From-address for outgoing photo emails. |
| `VITE_DEFAULT_ADMIN_PIN` | Client | `2802` | Default 4-digit operator/admin PIN (changeable in admin panel). |
| `VITE_DEFAULT_PRICE` | Client | `25000` | Default displayed price in IDR (changeable in admin panel). |

`VITE_*` variables are embedded into the client bundle. `RESEND_API_KEY` is read only in
the serverless function via `process.env` and is never exposed to the browser.

## Run locally

```bash
npm run dev        # start the Vite dev server
npm run build      # type-check + production build into dist/
npm run preview    # serve the built app locally
npm run typecheck  # TypeScript type-check only
```

> The camera (`getUserMedia`) requires **HTTPS**. On `http://localhost` it works for
> development, but on the iPad you must use an HTTPS URL (see testing below).

## Deploy to Vercel

1. Push this project to a Git repository and import it into Vercel, or run `vercel` with
   the Vercel CLI.
2. Vercel auto-detects Vite. The build command is `npm run build` and the output
   directory is `dist` (also pinned in `vercel.json`).
3. In **Project → Settings → Environment Variables**, add `RESEND_API_KEY` and, if you
   want non-default values, `VITE_SENDER_EMAIL`, `VITE_DEFAULT_ADMIN_PIN`,
   `VITE_DEFAULT_PRICE`.
4. Deploy. Vercel serves over HTTPS automatically, which satisfies the camera requirement.

## Testing on the iPad

1. Open the deployed HTTPS URL in Safari on the iPad Pro.
2. Rotate to landscape.
3. Tap **Share → Add to Home Screen** to install the PWA, then launch it from the home
   screen for full-screen (no Safari chrome).
4. For a locked-down event kiosk, enable **Guided Access**
   (Settings → Accessibility → Guided Access) so guests cannot leave the app.
5. Grant camera permission when prompted (required for the capture step).
