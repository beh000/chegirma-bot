const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://evos.uz';
// ПРОВЕРИТЬ после деплоя: реальный путь раздела акций/комбо.
const PROMO_URL = 'https://evos.uz/promo';

const SELECTORS = {
  item: '.promo-card, [class*="PromoCard"], .card',
  title: '.promo-card__title, [class*="title"], h3',
  oldPrice: '[class*="oldPrice"], s, del',
  newPrice: '[class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

async function parse() {
  const html = await fetchHtml(PROMO_URL);
  const $ = cheerio.load(html);

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({
    ...c,
    discount: computeDiscount(c.oldPrice, c.newPrice),
    category: 'food',
  }));
}

module.exports = { parse };
