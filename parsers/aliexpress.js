const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  computeDiscount, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://aliexpress.com';
// AliExpress отдаёт каталог через тяжёлый JS-рендеринг и активно
// защищается от ботов (антибот/капча на уровне CDN) — простой axios+cheerio
// запрос гарантированно получает пустую заглушку. Пробуем headless-браузер
// со stealth-плагином (см. utils/browser.js) — не гарантия обхода, но
// единственный бесплатный вариант; официальная альтернатива — AliExpress
// Affiliate API (нужна партнёрская регистрация).
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
  const html = await fetchRendered(PROMO_URL, {
    waitForSelector: '[class*="price"]',
    timeout: 45000,
    settleMs: 5000,
  });
  const $ = cheerio.load(html);

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  if (!cards.length) {
    console.warn('[AliExpress] 0 карточек — вероятно сайт отдал антибот-заглушку вместо каталога.');
  }
  return cards.map((c) => ({ ...c, discount: computeDiscount(c.oldPrice, c.newPrice) }));
}

module.exports = { parse };
