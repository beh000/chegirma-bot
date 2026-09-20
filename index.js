require('dotenv').config();
const cron = require('node-cron');
const http = require('http');

const { publishDeal } = require('./bot');
const { isPosted, markPosted } = require('./utils/storage');
const { makeId, computeDiscount } = require('./utils/parserHelpers');
const { detectCategory, CATEGORIES } = require('./utils/category');
const { delay } = require('./utils/http');

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

  console.log('=== Цикл завершён ===\n');
}

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
