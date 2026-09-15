require('dotenv').config();
const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
const fs    = require('fs');
const path  = require('path');
const axios = require('axios');

const USERNAME           = process.env.TARGET || process.env.TIKTOK_USERNAME || process.argv[2];
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID   = process.env.TELEGRAM_CHAT_ID;
const DRY_RUN            = process.argv.includes('--dry-run');
const STATE_FILE         = path.join(__dirname, 'state.json');
const AUTH_STATE_FILE    = path.join(__dirname, 'auth-state.json');

if (!USERNAME) { console.error('Set TARGET env var or pass username as argument.'); process.exit(1); }

function loadState()      { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { lastId: null }; } }
function saveState(s)     { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

async function notify(msg) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    chat_id: TELEGRAM_CHAT_ID, text: msg, parse_mode: 'HTML',
  });
}

async function scrape(username) {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: AUTH_STATE_FILE,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`https://www.tiktok.com/@${username}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    let clicked = false;
    for (const sel of [
      page.locator('[class*="PRepost"]').first(),
      page.locator('[class*="DivVideoFeedTab"]').getByText(/^reposts?$/i).first(),
    ]) {
      if ((await sel.count()) > 0) { await sel.click(); await page.waitForTimeout(4000); clicked = true; break; }
    }
    if (!clicked) return [];

    await page.waitForSelector('a[href*="/video/"]', { timeout: 15000 });

    const seen = new Set(), items = [];
    for (const el of await page.locator('a[href*="/video/"]').all()) {
      const href = await el.getAttribute('href');
      const m = href && href.match(/@([^/?]+)\/video\/(\d+)/);
      if (!m || seen.has(m[2])) continue;
      seen.add(m[2]);
      items.push({ id: m[2], creator: m[1], url: `https://www.tiktok.com/@${m[1]}/video/${m[2]}` });
    }
    return items;
  } finally {
    await browser.close();
  }
}

async function main() {
  const ts = new Date().toISOString();
  try {
    const items = await scrape(USERNAME);
    if (items.length === 0) { console.log(`[${ts}] nothing found`); return; }

    if (DRY_RUN) {
      console.log(`[${ts}] dry-run — ${items.length} item(s):`);
      items.forEach((r, i) => console.log(`  ${i + 1}. @${r.creator}  ${r.url}`));
      return;
    }

    const state = loadState();
    if (state.lastId === null) {
      state.lastId = items[0].id;
      saveState(state);
      console.log(`[${ts}] initialized`);
      return;
    }

    const knownIdx = items.findIndex(r => r.id === state.lastId);
    const fresh    = knownIdx === -1 ? [items[0]] : items.slice(0, knownIdx);
    if (fresh.length === 0) { console.log(`[${ts}] no change`); return; }

    console.log(`[${ts}] ${fresh.length} new item(s)`);
    const n = fresh.length;
    const lines = [`<b>@${USERNAME}</b> reposted ${n} video${n > 1 ? 's' : ''}! ??`, ''];
    fresh.forEach((r, i) => {
      if (n > 1) lines.push(`<b>${i + 1}.</b>`);
      lines.push(`?? <b>@${r.creator}</b>`);
      lines.push(`?? ${r.url}`);
      if (i < fresh.length - 1) lines.push('');
    });

    await notify(lines.join('\n'));
    state.lastId = fresh[0].id;
    saveState(state);
  } catch (e) {
    console.error(`[${ts}]`, e.message);
  }
}

main();
