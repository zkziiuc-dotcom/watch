// Run this ONCE, locally, to log into your dummy TikTok account and save
// the session. Every future check reuses this saved session - no repeated
// logins, no automated-login behavior for TikTok to flag.
//
// Usage: node login-once.js

const { chromium } = require('playwright');
const readline = require('readline');

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(prompt, () => { rl.close(); resolve(); }));
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.tiktok.com/login');

  console.log('\nA real browser window just opened.');
  console.log('Log into your DUMMY TikTok account there (NOT your main account).');
  await waitForEnter('Once you are fully logged in and see your feed, press Enter here...\n');

  await context.storageState({ path: 'auth-state.json' });
  console.log('Saved session to auth-state.json');
  console.log('Keep this file private - it is a live login session for that account.');

  await browser.close();
})();
