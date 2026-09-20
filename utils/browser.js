const { chromium } = require('playwright');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Для сайтов, которые либо рендерят каталог через JS (SPA без данных в
// исходном HTML), либо блокируют обычные HTTP-запросы (WAF/антибот).
// Один браузер на весь цикл проверки — запускается лениво при первом
// обращении, закрывается в конце runCycle() (см. index.js), чтобы не
// держать Chromium в памяти между прогонами cron.
let browserPromise = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

async function closeBrowser() {
  if (!browserPromise) return;
  const browser = await browserPromise;
  browserPromise = null;
  await browser.close().catch(() => {});
}

async function fetchRendered(url, {
  waitUntil = 'networkidle', timeout = 30000, waitForSelector,
} = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext({
    userAgent: UA,
    locale: 'ru-RU',
    viewport: { width: 1366, height: 900 },
  });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil, timeout });
    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10000 }).catch(() => {});
    }
    return await page.content();
  } finally {
    await context.close();
  }
}

module.exports = { fetchRendered, closeBrowser };
