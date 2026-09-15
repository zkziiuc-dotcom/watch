# Side AI Guide Problems & Setup Troubleshooting

A comprehensive technical summary of issues encountered, root causes identified, and resolution steps for setting up and debugging the **TikTok Repost Watcher** (both Local Test and Free Headless versions).

---

## 1. Environment & Architecture Overview

### Repositories / Versions:
1. **`tiktok-repost-watcher-TEST`**:
   - Local testing dashboard running on Node.js/Express (`http://localhost:3000`).
   - Verifies the scraper logic, notifications (Discord webhook / Telegram bot), and state transitions before deploying to cloud CI/CD.
2. **`tiktok-repost-watcher-FREE`**:
   - Zero-cost architecture relying on headless browser automation (**Playwright** / Chromium) instead of paid Apify/third-party APIs.
   - Requires an authenticated dummy session stored in `auth-state.json`.
   - Designed to run on scheduled GitHub Actions workflows using base64-encoded session secrets.

---

## 2. Issues Encountered, Root Causes & Fixes

### Problem A: `MODULE_NOT_FOUND: 'dotenv'`
* **Error Output:**
  ```text
  Error: Cannot find module 'dotenv'
  Require stack:
  - C:\Users\oooom\Desktop\tiktok-repost-watcher-TEST\server.js
  ```
* **Root Cause:** Attempted to run `npm start` before dependencies defined in `package.json` were installed into `node_modules`.
* **Resolution:**
  ```bash
  npm install
  copy .env.example .env
  npm start
  ```

---

### Problem B: Playwright Downloaded Before Package Installation
* **Terminal Warning:**
  ```text
  WARNING: It looks like you are running 'npx playwright install' without first
  installing your project's dependencies.
  ```
* **Consequence:** Running `node login-once.js` immediately failed with:
  ```text
  Error: Cannot find module 'playwright'
  Require stack:
  - C:\Users\oooom\Desktop\tiktok-repost-watcher-FREE\login-once.js
  ```
* **Root Cause:** Playwright's browser binaries (Chromium v1243) were downloaded via `npx`, but the actual Node.js module `@playwright/test` / `playwright` was missing from the project directory.
* **Resolution:**
  ```bash
  cd C:\Users\oooom\Desktop\tiktok-repost-watcher-FREE
  npm install
  ```

---

### Problem C: "Too Many Attempts" Login Error on Automated Chromium
* **Symptom:** Opening `node login-once.js` launched an automated Chromium instance (`headless: false`). When attempting to log into the dummy TikTok account, TikTok flagged the automated browser fingerprint (missing WebGL signatures, automation flags) and blocked access with a `"Too many attempts"` error.
* **Solution Strategy (Cookie Bypass via Opera):**
  Instead of logging in through Playwright, export the active session cookies directly from Opera and convert them into Playwright's expected `auth-state.json` schema.

#### Manual Cookie Export & Conversion Flow:
1. **Export from Opera:**
   - Log into the dummy account on `tiktok.com` in Opera.
   - Use the **Cookie-Editor** extension.
   - Click **Export → Export as JSON** and save to a file named `cookies.json` in the project root.
2. **Transform Script (`convert-cookies.js`):**
   - Maps browser cookie attributes (`sameSite`, `expirationDate`, booleans) into Playwright's StorageState format:
   ```javascript
   const fs = require('fs');

   try {
     const rawCookies = JSON.parse(fs.readFileSync('cookies.json', 'utf8'));

     const formattedCookies = rawCookies.map(cookie => {
       let sameSite = 'None';
       if (cookie.sameSite) {
         const val = cookie.sameSite.toLowerCase();
         if (val === 'lax') sameSite = 'Lax';
         if (val === 'strict') sameSite = 'Strict';
         if (val === 'no_restriction' || val === 'none') sameSite = 'None';
       }

       return {
         name: cookie.name,
         value: cookie.value,
         domain: cookie.domain,
         path: cookie.path || '/',
         expires: cookie.expirationDate ? Math.floor(cookie.expirationDate) : -1,
         httpOnly: Boolean(cookie.httpOnly),
         secure: Boolean(cookie.secure),
         sameSite: sameSite
       };
     });

     const authState = {
       cookies: formattedCookies,
       origins: []
     };

     fs.writeFileSync('auth-state.json', JSON.stringify(authState, null, 2));
     console.log('Successfully generated auth-state.json from Opera cookies!');
   } catch (err) {
     console.error('Failed to convert cookies:', err.message);
   }
   ```
3. **Execution:**
   ```bash
   node convert-cookies.js
   ```

---

### Problem D: `page.waitForSelector: Timeout 15000ms exceeded`
* **Error Output:**
  ```text
  [2026-09-15T07:52:25.914Z] Error: page.waitForSelector: Timeout 15000ms exceeded.
  Call log:
    - waiting for locator('a[href*="/video/"]') to be visible
      - waiting for "https://www.tiktok.com/@ashenbot" navigation to finish...
      - navigated to "https://www.tiktok.com/@ashenbot"
  ```
* **Root Cause:** Playwright navigated to the target profile (`https://www.tiktok.com/@ashenbot`), but could not locate video links within 15 seconds. Possible triggers:
  1. **Bot Challenge / Captcha:** TikTok intercepted the navigation with a captcha or human verification overlay.
  2. **Session / Origin Context:** Cookies alone without matching `localStorage` / `origins` state may cause TikTok to render a "Log in to continue" modal or restrict profile tabs.
  3. **DOM Selector Mismatch:** TikTok frequently updates internal profile selectors or lazy-loads the repost feed behind a separate tab click (`/repost` or `div[role="tab"]`).

---

## 3. Resume Plan & Next Steps

When resuming troubleshooting, follow this direct sequence:

### Step 1: Enable Headed Mode for Inspection
Modify `check-repost.js` so the browser window is visible during execution:
```javascript
// In check-repost.js:
const browser = await chromium.launch({ headless: false });
```
Run:
```bash
node check-repost.js ashenbot --dry-run
```
Observe what renders in the browser window:
- [ ] Bot challenge / puzzle slider
- [ ] Login modal blocking the DOM
- [ ] Account page loaded, but repost tab not selected
- [ ] Profile has 0 reposts or reposts are private

### Step 2: Handle Captcha or Stealth Injection
If TikTok is detecting Playwright automation flags:
1. Install `playwright-extra` and `puppeteer-extra-plugin-stealth`:
   ```bash
   npm install playwright-extra puppeteer-extra-plugin-stealth
   ```
2. Replace standard chromium launch with the stealth plugin to mask webdriver signatures.

### Step 3: Verify Repost Tab Navigation Logic
Ensure `check-repost.js` navigates directly or clicks into the user's **Reposts** tab rather than relying purely on top-level profile video links (`a[href*="/video/"]`), as user profiles default to published videos, not reposts.

### Step 4: Encode Session for GitHub Actions (Once Local Verification Passes)
On Windows Command Prompt / PowerShell:
```powershell
powershell -Command "[Convert]::ToBase64String([IO.File]::ReadAllBytes('auth-state.json')) | Set-Clipboard"
```
Configure repository secrets:
- `AUTH_STATE_B64`
- `TIKTOK_USERNAME`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
