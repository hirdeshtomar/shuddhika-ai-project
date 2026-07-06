# AiSensy Setup — Daily Auto-Outreach + Team Inbox

Your Shuddhika system finds mustard-oil buyer leads daily. AiSensy sends the
WhatsApp outreach and gives your team a shared inbox. This is the one-time setup.

## The big picture

- **Shuddhika (this app)** scrapes Google Maps every morning, scores leads for
  mustard-oil relevance, and sends the day's best new leads into AiSensy.
- **AiSensy** delivers the WhatsApp message, and every reply shows up in AiSensy's
  team inbox **and** — thanks to Coexistence — your normal WhatsApp Business app.
  Your whole team can see and reply, and everyone gets notified.

## Part 1 — Sign up with Coexistence (keeps your number in the WhatsApp app)

1. Go to https://aisensy.com and create an account.
2. Start the WhatsApp API signup. **Important:** ask AiSensy support (live chat or
   support@aisensy.com) to enable **WhatsApp Coexistence** for your number
   `+91 …` so it works in the WhatsApp Business app AND the API together.
3. Complete Facebook Business login when prompted (this uses Business login, which
   works for you — it does NOT need the blocked developer platform).
4. Finish Meta Business verification if asked. Your number stays live in the
   WhatsApp Business app the whole time.

## Part 2 — Create the outreach template

1. In AiSensy → **Templates** → create a **Marketing** template in Hindi/English.
   Keep it short, mention who you are, and give an easy opt-out. Example body:

   > Namaste {{1}}, this is Shuddhika Pure Mustard Oil. We supply pure Kachi Ghani
   > mustard oil (yellow & black) in 1L–15L packs at wholesale rates for {{2}}.
   > Reply *PRICE* for a rate list or *STOP* to opt out.

   `{{1}}` = contact name, `{{2}}` = business name (our code fills these in order).
2. Submit for approval. Meta usually approves within a few hours.

## Part 3 — Create the API Campaign

1. AiSensy → **Campaigns** → **Create API Campaign** (not a broadcast).
2. Attach the approved template. Give it a name, e.g. `shuddhika_daily_outreach`.
3. Save. **This exact name goes into `AISENSY_CAMPAIGN_NAME`.**

## Part 4 — Get your API key

AiSensy → open your project → **Manage** → **Generate API Key** → copy it.
This is `AISENSY_API_KEY`. Keep it secret.

## Part 5 — Add settings in Vercel

Vercel → project → Settings → Environment Variables (Production):

| Name | Value |
|---|---|
| `AISENSY_API_KEY` | the key from Part 4 |
| `AISENSY_CAMPAIGN_NAME` | the campaign name from Part 3 (e.g. `shuddhika_daily_outreach`) |
| `DAILY_OUTREACH_ENABLED` | `true` (set to `false` anytime to pause) |
| `DAILY_OUTREACH_CAP` | `40` — max messages sent per day (start small) |
| `DAILY_OUTREACH_MIN_RELEVANCE` | `55` — only message strong prospects |
| `DAILY_OUTREACH_COMBOS` | `3` — how many city+category combos to scrape per day |
| `CRON_SECRET` | any long random string (protects the cron endpoints) |

Redeploy after saving.

## Part 6 — How the daily run works

- Every day at **10 AM IST** Vercel calls `/api/cron/daily-outreach`.
- It scrapes 3 rotating targets (e.g. "kirana store in Lucknow", "pickle
  manufacturers in Patna"), which shift daily so you cover many places over time.
- It picks the best new, uncontacted, high-relevance leads (up to the cap) and
  sends them the template through AiSensy.
- You + your team get a push notification, and any replies appear in AiSensy's
  inbox and your WhatsApp Business app.

To test before going live: keep `DAILY_OUTREACH_ENABLED=false`, then trigger once
manually (replace SECRET):

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://shuddhika-ai-project.vercel.app/api/cron/daily-outreach
```

(with it disabled it just reports what it *would* do). Flip to `true` when ready.

## Tuning

- Start with `DAILY_OUTREACH_CAP=20` for the first week while your number's quality
  rating builds, then raise it.
- Meta allows ~2 marketing messages per user per day across all businesses, so some
  sends may not deliver — that's normal. Getting a **reply** removes the limit and
  makes further messaging free, so a good template matters more than volume.
- Add or reorder cities/categories in `backend/src/services/dailyOutreach.ts`
  (`OUTREACH_QUERIES`, `OUTREACH_CITIES`).
