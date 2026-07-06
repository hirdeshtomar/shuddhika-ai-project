# Shuddhika Android App — Build, Test & Publish

This folder is a complete Android project (Trusted Web Activity) wrapping the live app at
`https://shuddhika-ai-project.vercel.app`. All screens load from the website, so deploying
the frontend updates the app automatically — you only rebuild for icon/name/domain changes.

**Signing:** `shuddhika-release.keystore` (alias `shuddhika`). Passwords are in
`keystore-passwords.txt` and `gradle.properties`. **Back both files up somewhere safe
(e.g. Google Drive). If you lose the keystore you cannot update the app on Play Store.**
These files are gitignored — never commit them.

## Step 0 — Deploy the frontend once

The repo now contains `frontend/public/.well-known/assetlinks.json` (proves the app and
website belong together — without it the app shows a browser address bar). Deploy the
frontend to Vercel, then verify:
https://shuddhika-ai-project.vercel.app/.well-known/assetlinks.json

## Step 1 — Test in the emulator

1. Open Android Studio → **Open** → select this `android/` folder.
2. Wait for Gradle sync (first time downloads dependencies; if asked about a missing
   Gradle wrapper, accept the fix Android Studio offers).
3. Device Manager → create/start any recent phone image (e.g. Pixel 7, API 34).
   Use an image **with Play Store** so Chrome is included — TWAs need Chrome.
4. Press **Run ▶**. The app installs and opens the live site full-screen.
5. Test: login, leads list, tap a phone number (dialer should open), notifications
   (Settings in app → allow notifications).

Or from the command line:
```bash
cd android
./gradlew installDebug
adb shell monkey -p com.shuddhika.leads 1
```

## Step 2 — Build the Play Store bundle (.aab)

In Android Studio: **Build → Generate Signed App Bundle / APK → Android App Bundle**
→ choose `shuddhika-release.keystore`, alias `shuddhika`, passwords from
`keystore-passwords.txt` → **release** → Finish.

Or: `./gradlew bundleRelease` — output at `app/build/outputs/bundle/release/app-release.aab`.

## Step 3 — Publish on Play Console

At https://play.google.com/console:

1. **Create app** → Name: `Shuddhika Lead Management`, App/Free.
2. Since this is a staff-only tool, use **Internal testing** (fastest, minimal review):
   Testing → Internal testing → Create release → upload the `.aab` → add tester emails
   (yours + workers') → Save & rollout. Testers install via a link within minutes.
3. When Play App Signing asks, accept (default). Then IMPORTANT:
   - Go to **Setup → App integrity → App signing** and copy the
     **App signing key certificate SHA-256**.
   - Add it as a second entry in `frontend/public/.well-known/assetlinks.json`
     (keep the existing one too) and redeploy. Play-installed apps are signed with
     Google's key, so without this the address bar comes back.
4. For a full public listing later, complete: store listing (descriptions in
   `store-listing.md`), screenshots (take from emulator: Ctrl+S), 512×512 icon
   (`frontend/public/icon-512.png`), feature graphic 1024×500, content rating
   questionnaire (Utility, no objectionable content), data safety form (data collected:
   email + name for login, not shared), and privacy policy URL:
   `https://shuddhika-ai-project.vercel.app/privacy.html`.
   Review for public listings typically takes 1–7 days.

## Notes

- **App links both ways**: the same SHA-256 fingerprint lives in this project's
  `strings.xml` (asset_statements) and the website's `assetlinks.json`.
- **Version bumps**: increment `versionCode` (and `versionName`) in `app/build.gradle`
  for every new Play upload.
- **Package ID**: `com.shuddhika.leads` — cannot change after first Play upload.
