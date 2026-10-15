# Sermon Brief: plan

## Next up: a free web version

The goal is to use Sermon Brief from any browser, at no (or nearly no) cost.

The app needs a computer that stays on, keeps its files (the briefs database), and can work for a minute or two per brief (OCR + Tavily). That rules out a "just deploy it" free host, so these are the realistic options.

Whichever option we pick, **put a login in front of it.** The app has no accounts, so without one anyone who finds the address can read the briefs and spend the Tavily credits.

### Option 1: An always-on computer we already have, plus Cloudflare (recommended)

- Run the app on a church/office computer: the Windows app, or `npm run build && npm start` on a Mac.
- A **Cloudflare Tunnel** (free) gives it a secure web address that works from anywhere.
- **Cloudflare Access** (free for up to about 50 users) adds a login screen: people sign in with a one-time code sent to their email.
- **Cost:** free, except we need a domain on Cloudflare (about $10/year). Cloudflare's free test addresses don't support the login screen.
- **Code changes:** none. Setup takes about 20 minutes.
- **Catch:** it's only reachable while that computer is on.

### Option 2: Oracle Cloud "Always Free" server

- A real server running 24/7 for $0, and the app runs on it unchanged. Same Cloudflare login in front.
- Oracle cut the free allowance in mid-2026, to 2 CPUs and 12 GB of memory. That's still plenty for this app.
- **Catches:** a credit card is needed to sign up, setup is real server administration, and Oracle can change the free terms again.

### Option 3: Rebuild for free serverless hosting (Vercel + Turso)

- Move OCR and PDF reading into each user's browser, store briefs in Turso's free database (about 5 GB), and host on Vercel's free Hobby plan.
- **Catches:**
  - This is a substantial rework.
  - Vercel's free plan is for personal, non-commercial use, and a church team's tool is a grey area.
  - Sources disagree on how long requests may run on that plan (anywhere from 10 seconds to 5 minutes).
- Only worth it if we want nothing to maintain and are comfortable with those terms.

### To decide

1. Is there a computer that can stay on? If yes, choose Option 1; if no, consider Option 2.
2. Does the church already own a domain? If not, buy one and add it to Cloudflare.

### Sources (checked October 2026)

- [Vercel Hobby plan](https://vercel.com/docs/accounts/plans/hobby)
- [Vercel free tier limits 2026 (Deploywise)](https://deploywise.dev/blog/vercel-free-tier-limits-2026)
- [Is Vercel free? (Zplatform)](https://zplatform.ai/guides/is-vercel-free/)
- [Oracle Cloud free tier cut (InfoQ)](https://infoq.com/news/2026/07/oracle-cloud-free-tier-limits/)
- [Oracle Cloud free tier changes 2026 (Terminal Bytes)](https://terminalbytes.com/oracle-cloud-free-tier-changes-2026)
- [Cloudflare Zero Trust free plan (CostBench)](https://costbench.com/software/business-vpn/cloudflare-zero-trust/free-plan/)
- [Cloudflare Access free plan (CostBench)](https://costbench.com/software/ztna/cloudflare-access/free-plan/)
- [Turso pricing](https://turso.tech/pricing.md)

Free tiers change often, so recheck these before committing to one.

## Later

- **Code-sign the Windows installer** so Windows stops showing "Windows protected your PC" (Azure Trusted Signing, about $10/month).
- **Automatic updates** for the desktop app, so installed copies update themselves instead of being reinstalled.
