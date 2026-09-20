const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://aliexpress.com';
// ВАЖНО: AliExpress отдаёт каталог через тяжёлый JS-рендеринг и активно
// защищается от ботов (антибот/капча на уровне CDN) — простой axios+cheerio
// запрос с высокой вероятностью получит пустую/заглушечную страницу.
// Это не баг парсера, а ограничение сайта. Если после деплоя лог стабильно
// показывает 0 акций, реальные варианты: 1) Aliexpress Affiliate API
// (официальный, требует регистрации партнёром), 2) headless-браузер
// (Playwright) с проксями, что сильно увеличит нагрузку и сложность.
const PROMO_URL = 'https://aliexpress.com/ru/deals';

const SELECTORS = {
  item: '[class*="product-card"], [class*="ProductCard"], .list-item',
  title: '[class*="title"]',
  oldPrice: '[class*="price"] del, [class*="original"], s',
  newPrice: '[class*="price"]:not([class*="original"])',
  image: 'img',
  link: 'a',
};

async function parse() {
  const html = await fetchHtml(PROMO_URL);
  const $ = cheerio.load(html);

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  if (!cards.length) {
    console.warn('[AliExpress] 0 карточек — вероятно сайт отдал антибот-заглушку вместо каталога.');
  }
  return cards.map((c) => ({ ...c, discount: computeDiscount(c.oldPrice, c.newPrice) }));
}

module.exports = { parse };
