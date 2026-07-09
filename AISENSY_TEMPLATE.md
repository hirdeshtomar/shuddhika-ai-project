# Shuddhika WhatsApp Template — for AiSensy Approval

Copy these into AiSensy → Templates → Create Template. Category **Marketing**,
language **English** (the body is Hinglish, which is fine under English).

Uses exactly **one variable `{{1}}`** = the shop/contact name, which matches what
our code sends.

---

## Template name
`shuddhika_mustard_intro`
(Use this exact name — or whatever you name it — as `AISENSY_CAMPAIGN_NAME` when you
create the API Campaign around it.)

## Header
**Type: Video** — upload the sample video (see "Video / Dropbox" below).

## Body
```
Hello {{1}},
We manufacture *100% Pure Mustard Oil* with *No Adulteration* for customers interested in consuming only healthy oil (without any mixing of palm oil or any other chemicals).
Two varieties are available
- Yellow Mustard Oil
- Black Mustard Oil
Available in 1L, 2L, 5L and 15L packs at wholesale rates.
```

## Footer
```
Shuddhika – Shuddhता की गारंटी
```
(or plain: `Shuddhika – Purity Guaranteed`)

## Buttons
WhatsApp now lets a marketing template mix button types (max 10, but only one Call
and one URL). Set up **three**:

1. **Quick Reply** → button text: `Send Price List`
   (When someone taps it, the words "Send Price List" arrive as their reply — our
   system/AiSensy auto-replies can answer, and it opens the free 24h chat window.)
2. **Call Phone Number** → button text: `Call Us` → number: your business number.
3. **Visit Website / Watch Video (URL)** → button text: `Watch Video` → URL: your
   HTTPS video or website link.

> **Why the URL button matters:** from 1 Jan 2026 Meta requires every marketing
> template to contain a valid HTTPS link — in the body or a CTA button. The video/
> website URL button satisfies this, so keep at least one URL present.

**If AiSensy's editor won't let you mix Quick Reply + Call/URL:** use two Quick
Reply buttons instead — `Send Price List` and `Call Me Back` — and paste your
HTTPS video link as the last line of the body text to meet the URL rule.

## Video / Dropbox
Template video headers use a **fixed sample** you upload once (same video sends to
everyone — exactly what you want), so no code changes are needed.

- Best: **download the MP4 from Dropbox and upload the file** directly in AiSensy.
- If AiSensy asks for a URL instead, make the Dropbox link a *direct* one:
  change the end from `?dl=0` to `?dl=1`, e.g.
  `https://www.dropbox.com/s/abc123/shuddhika.mp4?dl=1`
- Keep it short (under ~16 MB / ~30–60s) so it loads fast on 4G.

## Sample values (for the approval reviewer)
- `{{1}}` sample: `Sharma Kirana Store`

---

## After approval
1. Create an **API Campaign** in AiSensy using this template.
2. Put that campaign's name in Vercel as `AISENSY_CAMPAIGN_NAME`.
3. Run the one-number test (see AISENSY_SETUP.md) before enabling daily outreach.

## Handling the replies
- **"Send Price List"** taps and price questions: set an **auto-reply** in AiSensy
  that sends your rate list instantly, then a team member follows up. (Our app also
  has auto-reply rules if you prefer to drive it from there.)
- Once anyone replies, the 24-hour window opens — you can chat freely, no template,
  no per-message charge.
