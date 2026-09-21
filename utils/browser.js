const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

// Korzinka/Mediapark/Asaxiy отдают Cloudflare-челлендж ("Один момент…")
// голому Playwright — он легко палится по типичным headless-признакам
// (navigator.webdriver, отсутствие chrome.runtime и т.п.). stealth-плагин
// маскирует эти признаки под обычный браузер; полной гарантии обхода
// Cloudflare он не даёт (это его официально заявленный уровень — базовые
// эвристики, не Turnstile-капчу), но для конкретно "Один момент…"
// JS-челленджа шанс намного выше, чем без него.
chromium.use(StealthPlugin());

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

// waitUntil по умолчанию 'domcontentloaded', а не 'networkidle' — на
// korzinka.uz/mediapark.uz/asaxiy.uz "networkidle" ни разу не наступает
// за 45с (постоянные фоновые запросы — чаты, аналитика и т.п.), из-за
// чего вся загрузка отваливалась по таймауту без единого байта HTML.
// Вместо этого ждём конкретный селектор с ценами — надёжнее для таких
// сайтов и не медленнее для нормальных.
async function fetchRendered(url, {
  waitUntil = 'domcontentloaded', timeout = 30000, waitForSelector, selectorTimeout = 15000,
  settleMs = 0,
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
      await page.waitForSelector(waitForSelector, { timeout: selectorTimeout }).catch(() => {});
    }
    // Cloudflare-челлендж сначала отдаёт "Один момент…", затем сам
    // редиректит на настоящую страницу через несколько секунд — даём
    // на это дополнительное время сверх ожидания селектора.
    if (settleMs) await page.waitForTimeout(settleMs);
    return await page.content();
  } finally {
    await context.close();
  }
}

module.exports = { fetchRendered, closeBrowser };
