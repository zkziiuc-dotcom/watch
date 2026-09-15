require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const USERNAME = process.env.TIKTOK_USERNAME || process.argv[2];
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const DRY_RUN = process.argv.includes('--dry-run');

const STATE_FILE = path.join(__dirname, 'state.json');
const AUTH_STATE_FILE = path.join(__dirname, 'auth-state.json');

if (!USERNAME) {
  console.error('Usage: TIKTOK_USERNAME=<username> node check-repost.js   (or pass username as first argument)');
  process.exit(1);
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastRepostId: null };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function sendTelegram(message) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID missing');
  }
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    parse_mode: 'HTML',
  });
}

async function getLatestRepost(username) {
  if (!fs.existsSync(AUTH_STATE_FILE)) {
    throw new Error('auth-state.json not found - run "node login-once.js" first.');
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: AUTH_STATE_FILE,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.goto(`https://www.tiktok.com/@${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000); // let profile tabs fully render

    // Click the Reposts tab on the profile page.
    // TikTok uses [class*="PRepost"] for the Reposts tab button, and
    // [class*="DivVideoFeedTab"] for the profile tab bar (Videos / Reposts / Liked).
    // We try the most specific selector first, then fall back to a text match inside the tab bar.
    const selectors = [
      page.locator('[class*="PRepost"]').first(),
      page.locator('[class*="DivVideoFeedTab"]').getByText(/^reposts?$/i).first(),
    ];

    let clicked = false;
    for (const sel of selectors) {
      if ((await sel.count()) > 0) {
        await sel.click();
        await page.waitForTimeout(4000); // let repost feed load
        clicked = true;
        break;
      }
    }

    if (!clicked) {
      console.log(`  No Reposts tab found on @${username}'s profile — account may have 0 reposts.`);
      return null;
    }

    // Wait for video links in the repost feed
    await page.waitForSelector('a[href*="/video/"]', { timeout: 15000 });

    // Repost feed links point to the ORIGINAL creator's video: /@creator/video/ID
    const href = await page.locator('a[href*="/video/"]').first().getAttribute('href');
    const match = href && href.match(/@([^/?]+)\/video\/(\d+)/);
    if (!match) return null;

    const originalCreator = match[1];
    const videoId = match[2];
    const videoUrl = `https://www.tiktok.com/@${originalCreator}/video/${videoId}`;

    // Try to grab caption text — best effort, silent fail if not found
    let caption = null;
    try {
      const descEl = page.locator('[class*="DivDesc"] span, [class*="desc"] span, [data-e2e*="desc"]').first();
      if ((await descEl.count()) > 0) {
        const text = (await descEl.textContent({ timeout: 2000 })).trim();
        if (text.length > 0) caption = text.slice(0, 120);
      }
    } catch { /* caption stays null */ }

    return { videoId, originalCreator, videoUrl, caption };
  } finally {
    await browser.close();
  }
}



async function main() {
  const timestamp = new Date().toISOString();
  try {
    const repost = await getLatestRepost(USERNAME);

    if (!repost) {
      console.log(`[${timestamp}] Could not find any repost/video on @${USERNAME}'s reposts tab.`);
      return;
    }

    const { videoId, originalCreator, videoUrl, caption } = repost;

    if (DRY_RUN) {
      console.log(`[${timestamp}] (dry run) Latest repost found:`);
      console.log(`  Video ID:         ${videoId}`);
      console.log(`  Original creator: @${originalCreator}`);
      console.log(`  URL:              ${videoUrl}`);
      console.log(`  Caption:          ${caption || '(not found)'}`);
      return;
    }

    const state = loadState();

    if (state.lastRepostId === null) {
      state.lastRepostId = videoId;
      saveState(state);
      console.log(`[${timestamp}] Initialized. Watching @${USERNAME} — will notify on the next new repost.`);
      console.log(`  Current latest: @${originalCreator}/video/${videoId}`);
      return;
    }

    if (videoId !== state.lastRepostId) {
      console.log(`[${timestamp}] New repost detected for @${USERNAME}!`);

      const lines = [
        `🔁 <b>@${USERNAME}</b> just reposted!`,
        ``,
        `👤 Original by: <b>@${originalCreator}</b>`,
        `🔗 ${videoUrl}`,
      ];
      if (caption) lines.push(``, `📝 ${caption}`);

      await sendTelegram(lines.join('\n'));
      state.lastRepostId = videoId;
      saveState(state);
    } else {
      console.log(`[${timestamp}] No new repost for @${USERNAME}.`);
    }
  } catch (err) {
    console.error(`[${timestamp}] Error:`, err.message);
  }
}

main();
