require('dotenv').config();
const cron = require('node-cron');
const http = require('http');

const { publishDeal } = require('./bot');
const { isPosted, markPosted } = require('./utils/storage');
const { makeId, computeDiscount } = require('./utils/parserHelpers');
const { detectCategory, CATEGORIES } = require('./utils/category');
const { delay } = require('./utils/http');
const { closeBrowser } = require('./utils/browser');
const {
  inspectUrl, inspectRendered, dumpCard, dumpCardRendered,
} = require('./utils/inspect');

const SITES = [
  { name: 'Korzinka', store: 'Korzinka.uz', mod: require('./parsers/korzinka') },
  { name: 'Makro', store: 'Makro.uz', mod: require('./parsers/makro') },
  { name: 'Uzum', store: 'Uzum Market', mod: require('./parsers/uzum') },
  { name: 'Texnomart', store: 'Texnomart', mod: require('./parsers/texnomart') },
  { name: 'Mediapark', store: 'Mediapark', mod: require('./parsers/mediapark') },
  { name: 'Asaxiy', store: 'Asaxiy', mod: require('./parsers/asaxiy') },
  { name: 'AliExpress', store: 'AliExpress', mod: require('./parsers/aliexpress') },
  { name: 'Evos', store: 'EVOS', mod: require('./parsers/evos') },
  { name: 'Dominos', store: "Domino's Pizza", mod: require('./parsers/dominos') },
];

function normalizeDeal(raw, store) {
  const oldPrice = raw.oldPrice ?? null;
  const newPrice = raw.newPrice ?? null;
  const discount = raw.discount ?? computeDiscount(oldPrice, newPrice);

  if (!raw.title || !raw.link || !newPrice || !discount) return null;

  const category = raw.category || detectCategory(raw.title);
  // Канал пока публикует только еду, одежду и технику — всё остальное
  // (или то, что не удалось классифицировать) не постим.
  if (!category || !CATEGORIES[category]) return null;

  const id = raw.id || makeId(raw.link, raw.title, newPrice);

  return {
    id,
    title: raw.title.trim(),
    oldPrice,
    newPrice,
    discount,
    image: raw.image || null,
    link: raw.link,
    category,
    store,
    expiry: raw.expiry || null,
  };
}

async function processSite({ name, store, mod }) {
  console.log(`[${name}] Проверка сайта...`);

  let rawDeals = [];
  try {
    rawDeals = await mod.parse();
  } catch (err) {
    console.error(`[${name}] Ошибка парсинга: ${err.message}`);
    return;
  }

  console.log(`[${name}] Найдено акций на странице: ${rawDeals.length}`);

  let postedCount = 0;
  for (const raw of rawDeals) {
    const deal = normalizeDeal(raw, store);
    if (!deal) continue;
    if (isPosted(deal.id)) continue;

    const ok = await publishDeal(deal);
    if (ok) {
      markPosted(deal.id, { title: deal.title, store });
      postedCount += 1;
      console.log(`[${name}] ✅ Опубликовано: ${deal.title} (-${deal.discount}%)`);
    }
    // Пауза между постами, чтобы не упереться в лимиты Telegram API
    await delay(1500);
  }

  console.log(`[${name}] Новых публикаций: ${postedCount}`);
}

async function runCycle() {
  console.log(`\n=== Запуск цикла проверки: ${new Date().toISOString()} ===`);

  for (const site of SITES) {
    try {
      await processSite(site);
    } catch (err) {
      console.error(`[${site.name}] Непредвиденная ошибка: ${err.message}`);
    }
    // Пауза между сайтами
    await delay(2500);
  }

  // Закрываем headless-браузер между циклами, чтобы не держать Chromium
  // в памяти постоянно — используется только частью сайтов (browser.js).
  await closeBrowser();

  console.log('=== Цикл завершён ===\n');
}

// Диагностический режим: INSPECT=1 вместо обычного цикла один раз
// скачивает реальные страницы всех сайтов и печатает в лог подсказки о
// структуре разметки (классы у цен, наличие __NEXT_DATA__/JSON-LD) —
// нужен, чтобы поправить SELECTORS без браузерного доступа к сайтам.
// Карточки товара, для которых надо не только искать подсказки, а
// дампнуть реальный HTML целиком по уже известному селектору контейнера.
const CARD_DUMPS = {
  Texnomart: '.product-item-component',
};

async function runInspection() {
  const only = (process.env.INSPECT_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
  // INSPECT_BROWSER=1 прогоняет выбранные сайты через headless-браузер
  // (Playwright) вместо обычного axios-запроса — нужно для WAF-сайтов и
  // SPA без серверного рендера.
  const useBrowser = process.env.INSPECT_BROWSER === '1';
  const inspect = useBrowser ? inspectRendered : inspectUrl;
  const dump = useBrowser ? dumpCardRendered : dumpCard;

  const targets = [];
  for (const site of SITES) {
    if (only.length && !only.includes(site.name)) continue;
    if (site.mod.DEBUG_URL) targets.push({ label: site.name, url: site.mod.DEBUG_URL });
    if (site.mod.DEBUG_URLS) {
      site.mod.DEBUG_URLS.forEach((url, i) => targets.push({ label: `${site.name}#${i}`, url }));
    }
  }

  for (const t of targets) {
    // eslint-disable-next-line no-await-in-loop
    await inspect(t.label, t.url, { hintLimit: 20 });
    // eslint-disable-next-line no-await-in-loop
    await delay(1500);

    const cardSelector = CARD_DUMPS[t.label];
    if (cardSelector) {
      // eslint-disable-next-line no-await-in-loop
      await dump(t.label, t.url, cardSelector);
      // eslint-disable-next-line no-await-in-loop
      await delay(1500);
    }
  }

  // Разовая проверка страницы товара Texnomart — обычный axios (сайт
  // серверно рендерит HTML, браузер тут не нужен) — чтобы увидеть,
  // показывает ли она старую (зачёркнутую) цену, которой нет на странице
  // категории.
  if (process.env.INSPECT_PRODUCT_URL) {
    await inspectUrl('TexnomartProduct', process.env.INSPECT_PRODUCT_URL, { hintLimit: 20 });
  }

  if (useBrowser) await closeBrowser();
}

if (process.env.INSPECT === '1') {
  runInspection()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Ошибка инспекции:', err);
      process.exit(1);
    });
} else {
  // Railway ожидает открытый порт у веб-сервисов — держим лёгкий
  // health-check сервер, чтобы деплой не считался нерабочим.
  const PORT = process.env.PORT || 3000;
  http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('chegirma-bot жив и работает');
  }).listen(PORT, () => console.log(`Health-check сервер запущен на порту ${PORT}`));

  cron.schedule('*/30 * * * *', () => {
    runCycle().catch((err) => console.error('Ошибка планового цикла:', err.message));
  });

  console.log('chegirma-bot запущен. Проверка каждые 30 минут.');
  runCycle().catch((err) => console.error('Ошибка первого запуска:', err.message));

  process.on('unhandledRejection', (err) => {
    console.error('Необработанная ошибка (unhandledRejection):', err);
  });
  process.on('uncaughtException', (err) => {
    console.error('Необработанная ошибка (uncaughtException):', err);
  });
}
