const { chromium } = require('patchright');

// Korzinka/Mediapark/Asaxiy отдают Cloudflare-челлендж ("Один момент…")
// обычному Playwright — тот палится через утечки Chrome DevTools Protocol
// (в первую очередь Runtime.enable), которые обычные stealth-плагины на
// уровне JS не закрывают. Patchright — форк Playwright, который патчит
// сами эти утечки, а не маскирует признаки поверх. Гарантии обхода нет
// (это по-прежнему не платный anti-detect уровня Cloudflare Turnstile),
// но это следующий по силе бесплатный вариант после обычного stealth-плагина.
//
// По рекомендациям Patchright для максимальной незаметности: настоящий
// Chrome (не Chromium), постоянный профиль (launchPersistentContext)
// вместо одноразовых контекстов, БЕЗ подмены User-Agent — все это само по
// себе может быть лишним отличительным признаком для антибота.
const PROFILE_DIR = '/tmp/patchright-profile';

// Один постоянный контекст на весь процесс — то же самое "браузерное
// окно", а не новый профиль на каждый чих. closeBrowser() закрывает его
// в конце runCycle() (см. index.js), чтобы не держать Chrome в памяти
// между прогонами cron.
let contextPromise = null;

function getContext() {
  if (!contextPromise) {
    contextPromise = chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',
      headless: true,
      viewport: { width: 1366, height: 900 },
      locale: 'ru-RU',
      args: ['--no-sandbox'],
    });
  }
  return contextPromise;
}

async function closeBrowser() {
  if (!contextPromise) return;
  const context = await contextPromise;
  contextPromise = null;
  await context.close().catch(() => {});
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
  const context = await getContext();
  const page = await context.newPage();
  try {
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
    await page.close();
  }
}

// Диагностика: открывает страницу и записывает все JSON-ответы (XHR/fetch),
// которые сайт сам загружает при рендере — так можно найти внутренний API
// сайта (часто отдаёт больше полей, чем показано в вёрстке, например
// старую цену, которой нет в HTML) без доступа к DevTools вручную.
async function captureNetwork(url, {
  timeout = 30000, settleMs = 5000, maxHits = 15,
} = {}) {
  const context = await getContext();
  const page = await context.newPage();
  const hits = [];

  page.on('response', (response) => {
    if (hits.length >= maxHits) return;
    const ct = response.headers()['content-type'] || '';
    if (!ct.includes('application/json')) return;
    hits.push(
      response.text()
        .then((body) => ({
          url: response.url(),
          status: response.status(),
          bodyPreview: body.slice(0, 800),
        }))
        .catch((err) => ({ url: response.url(), status: response.status(), error: err.message })),
    );
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    if (settleMs) await page.waitForTimeout(settleMs);
  } finally {
    await page.close();
  }

  return Promise.all(hits);
}

// Диагностика: реальный скриншот страницы в base64 — когда текстовые
// эвристики (цены, JSON, сетевые запросы) ничего не находят и непонятно,
// что вообще на экране (антибот-заглушка? экран выбора города? просто
// пустая страница?), проще один раз посмотреть глазами, чем гадать дальше.
async function screenshotBase64(url, {
  timeout = 30000, settleMs = 5000, width = 800, height = 600, quality = 40,
} = {}) {
  const context = await getContext();
  const page = await context.newPage();
  try {
    await page.setViewportSize({ width, height });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
    if (settleMs) await page.waitForTimeout(settleMs);
    const buffer = await page.screenshot({ type: 'jpeg', quality });
    return buffer.toString('base64');
  } finally {
    await page.close();
  }
}

module.exports = {
  fetchRendered, closeBrowser, captureNetwork, screenshotBase64,
};
