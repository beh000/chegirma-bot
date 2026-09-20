const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, scrapeCards,
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
