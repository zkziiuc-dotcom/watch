# TikTok Repost Watcher — FREE version (dummy account + headless browser)

This version costs **$0** - no Apify, no paid API. Instead of scraping TikTok's raw API (which needs signed request parameters that break constantly), it uses a real headless browser to load the profile page like a person would, logged in as a **dummy TikTok account** you create just for this.

## Honest trade-offs vs. the Apify version

- **Free**, but requires creating a throwaway TikTok account and one manual login step.
- Uses a real (if automated) browser, so it's slower per check (~15-30 seconds vs ~2-3 seconds) and the GitHub Action run takes longer - still comfortably within free minutes at an hourly schedule, but don't go too frequent on a private repo (see below).
- Like any unofficial approach to TikTok, it can break if TikTok changes its page layout - the difference is you now own this code directly instead of depending on an abandoned third-party package, so it's fixable.
- Dummy account login sessions can occasionally expire (TikTok logs it out after weeks of inactivity, or flags unusual activity). If checks start failing, you redo the one-time login (5 minutes) and update one GitHub secret.

If you'd rather not deal with any of that, the Apify version from before is the lower-maintenance option for a small monthly cost (~$4.30, covered by Apify's free credit). This version is for avoiding that cost entirely.

## 1. Create a dummy TikTok account

Sign up for a new TikTok account you don't care about, used only to give this scraper a logged-in session. Do not use your real account.

## 2. Set up locally

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env
```

Fill in `.env`:
- `TIKTOK_USERNAME` - the account you want to watch (not the dummy account - that's just for logging in)
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` - from [@BotFather](https://t.me/BotFather) (see earlier setup steps if you need a refresher)

## 3. Log in once

```bash
node login-once.js
```

A real Chrome window opens. Log into your **dummy account** by hand (this lets you solve any captcha/verification yourself, which a fully automated login can't do). Once you're in and see your feed, come back to the terminal and press Enter. This saves `auth-state.json` - the session GitHub Actions will reuse.

**Keep `auth-state.json` private.** It's a live login session for that account. Never commit it to the repo - it's already in `.gitignore`.

## 4. Test locally

```bash
node check-repost.js <username> --dry-run
```

This prints what it finds without sending a notification or touching state - confirms the scraper can actually read the account's reposts through the logged-in session. Once that looks right, drop `--dry-run` to run it for real (first run just sets a baseline, same as usual).

## 5. Publish to GitHub Actions

1. Create a GitHub repo (private recommended, since this is more personal infrastructure) and upload this folder - **except** `auth-state.json` and `.env` (already gitignored, don't force-add them).
2. Base64-encode your session file and copy the output:
   ```bash
   base64 -i auth-state.json | tr -d '\n'
   ```
   (On some systems: `base64 -w 0 auth-state.json` instead.)
3. In the repo: **Settings → Secrets and variables → Actions**, add:

   | Secret name | Value |
   |---|---|
   | `AUTH_STATE_B64` | the base64 output from step 2 |
   | `TIKTOK_USERNAME` | account to watch |
   | `TELEGRAM_BOT_TOKEN` | your bot token |
   | `TELEGRAM_CHAT_ID` | your chat ID |

4. Go to the **Actions** tab → "TikTok Repost Watcher (Free)" → **Run workflow** to test it live.

It then runs automatically every hour, for free, indefinitely.

## If the session expires

If runs start failing with "could not find any repost" or similar after it previously worked, the dummy account's session likely expired. Just redo step 3 (`node login-once.js`) and update the `AUTH_STATE_B64` secret with the new value.

## Adjusting frequency

Default is hourly (`0 * * * *` in the workflow file). On a **public** repo, GitHub Actions minutes are unlimited, so you can go as frequent as every 15-20 minutes without cost concerns. On a **private** repo, stick to hourly or every 30 minutes to stay comfortably within the 2,000 free minutes/month.
"# watch" 
