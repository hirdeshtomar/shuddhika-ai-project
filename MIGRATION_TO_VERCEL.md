# Moving Everything to Vercel (goodbye Railway)

The whole system now runs on one Vercel project: the React frontend as static files,
the Express API as a serverless function (`api/index.ts`), and campaign sending via a
Vercel Cron job that fires every minute. The database moves to Supabase (free tier).

Do these steps in order — about 20 minutes total.

## 1. Supabase database (5 min)

1. Go to https://supabase.com/dashboard → your project (or create a new one, region Mumbai).
2. Click **Connect** (top bar) → copy TWO connection strings:
   - **Transaction pooler** (port **6543**) → this becomes `DATABASE_URL`.
     Append `?pgbouncer=true&connection_limit=1` to it.
   - **Direct connection** (port **5432**) → this becomes `DIRECT_URL`.
3. Create the tables — on your Mac:
   ```bash
   cd ~/Git-Hirdesh/shuddhika-ai-project/backend
   DATABASE_URL="<pooler-string>?pgbouncer=true&connection_limit=1" \
   DIRECT_URL="<direct-string>" \
   npm run db:push
   ```

## 2. Vercel project settings (5 min)

In the Vercel dashboard → your project → **Settings**:

1. **Build & Development Settings → Root Directory**: clear it (set to repo root, was
   probably `frontend`). The new root `vercel.json` handles everything.
2. **Environment Variables** — add all of these (Production):

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler string + `?pgbouncer=true&connection_limit=1` |
   | `DIRECT_URL` | Supabase direct string |
   | `JWT_SECRET` | any long random string |
   | `WHATSAPP_ACCESS_TOKEN` | from your Meta app (same value as before) |
   | `WHATSAPP_PHONE_NUMBER_ID` | `1062803690239188` |
   | `WHATSAPP_BUSINESS_ACCOUNT_ID` | `940023388375861` |
   | `WHATSAPP_API_URL` | `https://graph.facebook.com/v18.0` |
   | `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | same value as before (from old Railway vars) |
   | `GOOGLE_MAPS_API_KEY` | your new key |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | same as before (`mailto:hirdesh2008@gmail.com` for subject) |
   | `CRON_SECRET` | any long random string — Vercel uses it to authenticate the cron |
   | `CAMPAIGN_GLOBAL_DAILY_CAP` | `250` (optional, this is the default) |

   Tip: your old values are in Railway → service → Variables (still viewable) and in
   `backend/.env` locally.

3. Push the code (`git push`) → Vercel redeploys with the new setup.

## 3. Point Meta's webhook at Vercel (3 min)

https://developers.facebook.com → your app → WhatsApp → **Configuration**:
- Callback URL: `https://shuddhika-ai-project.vercel.app/api/webhook/whatsapp`
- Verify token: the same `WHATSAPP_WEBHOOK_VERIFY_TOKEN` value
- Click **Verify and save**. Subscribe to `messages` (as before).

## 4. Verify (2 min)

- `https://shuddhika-ai-project.vercel.app/health` → `{"status":"ok"}`
- Open the app → Dashboard loads (login is disabled, remember)
- Find Leads → run a small scrape → leads appear
- Vercel → project → **Logs**: you should see `/api/cron/campaign-tick` requests once
  per minute (this is the campaign sender's heartbeat)

## 5. Delete the Railway project

Once the checks above pass, delete the Railway project/services so it stops billing.

## What changed technically

- `api/index.ts` wraps the whole Express app as one Vercel function (max 300s).
- Campaign sending is no longer a long-running loop. Every minute the cron hits
  `/api/cron/campaign-tick`, which sends whatever is due (respecting speed, business
  hours 9–21 IST, daily caps, spam-error auto-pause, success-rate auto-pause) and exits.
  Outside business hours campaigns just wait — no more auto-pausing overnight.
- Redis/BullMQ is gone entirely — nothing to host.
- Prisma talks to Supabase through the connection pooler (serverless-safe).
- Local dev is unchanged: `cd backend && npm run dev` (it self-ticks every minute).
