const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  computeDiscount, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://dominos.uz';
// /promo дал 404 в первом деплое — подтверждённый веб-поиском раздел акций.
const PROMO_URL = 'https://dominos.uz/stocks';

const SELECTORS = {
  item: '.promo-card, [class*="PromoCard"], .product-card, .card',
  title: '.promo-card__title, [class*="title"], h3',
  oldPrice: '[class*="oldPrice"], s, del',
  newPrice: '[class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

// dominos.uz — Nuxt-сайт, реальные данные зашиты в серилизованный
// __NUXT_DATA__ (не обычный JSON) и текстовым поиском недостижимы;
// headless-браузер рендерит финальный DOM, так что цены уже видны как
// обычный текст — проще, чем писать декодер под их формат сериализации.
async function parse() {
  const html = await fetchRendered(PROMO_URL, { waitForSelector: '[class*="price"]', timeout: 45000 });
  const $ = cheerio.load(html);

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({
    ...c,
    discount: computeDiscount(c.oldPrice, c.newPrice),
    category: 'food',
  }));
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
