# Shuddhika Android App Guide

The app is already a PWA (installable web app) with push notifications. There are two ways to get it on your workers' phones.

## Option 1: Install as PWA (works today, 2 minutes)

On each Android phone:

1. Open the Shuddhika dashboard URL in Chrome.
2. Tap the three-dot menu → **Add to Home screen** (or the "Install app" banner).
3. Log in. Allow notifications when asked (needed for new-lead and new-message alerts).

The app opens full-screen with its own icon, gets push notifications, and tap-to-call works through the phone's dialer. For 1–3 users this is all you need.

## Option 2: Build a real APK (shareable file, ~30 minutes)

An APK wraps the same web app in a "Trusted Web Activity". Use this if you want to send workers an APK file over WhatsApp instead of asking them to install from Chrome.

### Easiest path: PWABuilder

1. Go to https://www.pwabuilder.com
2. Enter your deployed frontend URL (the Vercel domain).
3. Click **Package for Stores** → **Android**.
4. Download the package. It contains:
   - `app-release-signed.apk` — share this file directly with workers
   - `assetlinks.json` — see next step
   - `signing.keystore` + passwords — **back these up**; you need them for every future update
5. Host `assetlinks.json` at `https://<your-domain>/.well-known/assetlinks.json`:
   - In this repo: create `frontend/public/.well-known/assetlinks.json` with the file's contents, then redeploy to Vercel.
   - Without this, the app shows a browser address bar on top.
6. Send the APK to workers. They enable "Install from unknown sources" when prompted and install.

### Updating the app

The APK is just a shell — all screens, buttons, and logic load from your website. Deploying a new frontend to Vercel updates the app automatically. You only rebuild the APK if you change the app name, icon, or domain.

### Play Store (optional, later)

If you ever want public distribution: create a Google Play developer account (one-time $25), upload the same package as an `.aab`, and complete the store listing. Not needed for internal use.

## Notification checklist

Push notifications now fire for: incoming WhatsApp messages, new scraped leads, and CSV imports. For them to work on a phone:

- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` set in backend env (already supported).
- User opened the app once and allowed notifications.
- Battery saver can delay notifications on some phones (Xiaomi/Oppo/Vivo): set the app to "No restrictions" in battery settings.
