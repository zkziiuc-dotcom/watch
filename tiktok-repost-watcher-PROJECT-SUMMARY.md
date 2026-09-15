# TikTok Repost Watcher — Project Summary

Handoff doc so you (or Claude in a new chat) can pick this up without re-explaining everything. Upload this file at the start of a new conversation and say "continue this project."

## Goal

A bot that watches a specific TikTok account. When they repost something new, send a Telegram notification — no other details, just the alert. Should run online (not dependent on a laptop being on).

## Requirements established during the build

- Notification via **Telegram only** (Discord was in the first version, later removed).
- No details in the notification beyond "they reposted something new."
- Must not use the user's own TikTok account/cookie — fear of account ban.
- Wants it free to run if at all possible.
- Wants an easy way to change the target account later.
- Wanted a local way to test everything (fetch reposts, send a test notification, force-test the detection pipeline) before trusting it unattended.

## What happened, in order

1. **First attempt**: used the free npm library `@tobyg74/tiktok-api-dl` (`GetUserReposts` function) in an always-on Node script with `node-cron`, notifying via Discord webhook or Telegram.
2. **Made it host-able without a laptop**: rebuilt as a **GitHub Actions** scheduled workflow (runs the check once every N minutes on GitHub's servers, commits `state.json` back to the repo between runs to remember the last-seen repost).
3. **Built a local test dashboard** (`tiktok-repost-watcher-TEST`, an Express + HTML app) so the user could preview an account's reposts, send a test notification, and force-simulate a "new repost" to verify the full pipeline before publishing.
4. **Hit a wall**: testing on multiple real public accounts always failed with `Unexpected end of JSON input`. Investigated and confirmed via GitHub that this is a **known, unresolved, open bug** in the `@tobyg74/tiktok-api-dl` library itself (issue #69, filed Apr 2026, exact same error, no fix). The library is unreliable/effectively broken right now — not a problem with the user's setup.
5. **Switched the scraping backend to Apify** (`maximedupre/tiktok-reposts` actor, a maintained third-party scraping service, ~$3.15 per 1,000 reposts pulled). This also incidentally solved the "don't want to use my own TikTok account" concern, since Apify scrapes from its own servers — no user cookie needed at all. Removed Discord, kept Telegram only. This version worked successfully in testing.
6. **Cost/frequency tradeoff worked out**: Apify's free plan gives $5/month usage credit (no card required). At ~$0.003 per check (pulling 1 repost), checking every 30 minutes costs about $4.30/month — fits inside the free credit. This became the default schedule for the GitHub Actions version.
7. **User asked for a fully free alternative** (no dependency on any paid-capable service, even a free tier), open to using a dummy/throwaway TikTok account. Built a **third version** using **Playwright** (headless browser automation) + a one-time manual login to a dummy TikTok account, reusing the saved login session (`auth-state.json`) on every check. This avoids Apify entirely — $0 cost, just GitHub Actions' free minutes. Tradeoff: the dummy account's session can occasionally expire and need re-login; it's slightly more fragile than Apify since it depends on TikTok's page structure directly, but the code is fully owned (not an abandoned third-party package).

## Current state: three parallel versions exist

### 1. `tiktok-repost-watcher-TEST` (local test dashboard)
- Express server + simple HTML dashboard at `localhost:3000`.
- **Currently wired to use Apify** (updated after the library was found broken) + Telegram only.
- Buttons: Fetch Reposts (preview), Send Test Notification, Run Check Now, Simulate a New Repost, Reset State.
- Also has `test-apify.js`, a standalone diagnostic script bypassing the browser/server entirely.
- Needs `.env`: `APIFY_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

### 2. `tiktok-repost-watcher-github-actions` (Apify-based, published version)
- Runs on a GitHub Actions schedule (`*/30 * * * *`, every 30 min by default).
- Uses Apify's `maximedupre/tiktok-reposts` actor via HTTP API, Telegram only.
- State (`state.json`) is committed back to the repo by the workflow after each run.
- Needs GitHub repo secrets: `TIKTOK_USERNAME`, `APIFY_API_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- Supports a manual "username_override" input on the Run Workflow button for one-off checks of a different account.
- **Cost**: ~$4.30/month in Apify usage at this frequency, covered by Apify's free $5/month credit. Not truly $0, but effectively free within normal use.
- This version was confirmed working by the user in local testing (via the TEST dashboard, which shares the same Apify approach).

### 3. `tiktok-repost-watcher-FREE` (Playwright + dummy account, genuinely $0)
- Uses a headless Chromium browser (Playwright) instead of any paid API.
- `login-once.js`: one-time script that opens a **real, visible** browser for the user to manually log into a dummy TikTok account (avoids automated-login/captcha issues). Saves the session to `auth-state.json`.
- `check-repost.js`: loads that saved session, navigates to the profile's Reposts tab, grabs the latest video ID from the page, compares to stored state, sends Telegram notification if new. Supports `--dry-run` for local testing without notifying/touching state.
- GitHub Actions workflow: restores the session from a **base64-encoded GitHub secret** (`AUTH_STATE_B64` — never commit `auth-state.json` directly, it's a live login session), runs the check hourly by default, commits `state.json` back.
- **Not yet tested by the user** — this was just built and delivered, pending user testing (`node check-repost.js <username> --dry-run` locally first).
- Known tradeoffs documented in its README: session can expire and need re-login; slower per-check than Apify (~20-30s vs ~2-3s); more exposed to TikTok changing its page layout, but the code is fully owned/fixable.

## Key technical facts worth remembering

- TikTok video/repost URLs look like `https://www.tiktok.com/@username/video/1234567890123456789` — the numeric ID after `/video/` is what's used as the "latest repost ID" for comparison in the Playwright version.
- Apify actor `maximedupre/tiktok-reposts` output fields: `repostId`, `caption`, `createdAt`, `repostUrl`, `sourceProfile`. Called via `POST https://api.apify.com/v2/actors/maximedupre~tiktok-reposts/run-sync-get-dataset-items?token=<TOKEN>` with body `{"profiles": ["https://www.tiktok.com/@username"], "maxItemsPerProfile": N}`.
- The abandoned/broken library reference for future context: `@tobyg74/tiktok-api-dl`, function `GetUserReposts(username, {postLimit, cookie, proxy})` — avoid relying on this without checking if its open GitHub issues have since been resolved.

## Open items / possible next steps

- User has not yet tested the FREE (Playwright/dummy account) version — next step would be running `login-once.js` and `check-repost.js --dry-run` locally.
- User has not yet confirmed publishing either version to an actual GitHub repo (secrets setup, live scheduled runs).
- If continuing in a new chat: ask which version the user wants to move forward with (Apify-based `github-actions` folder, or the free `FREE` folder), and pick up from whichever step they're on (local testing vs. publishing vs. troubleshooting a live run).
