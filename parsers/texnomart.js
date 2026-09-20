const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, extractNextData,
  deepFindArrays, guessProduct, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://texnomart.uz';
// ПРОВЕРИТЬ после деплоя: реальный путь раздела акций.
const PROMO_URL = 'https://texnomart.uz/uz/aksiyalar';

const SELECTORS = {
  item: '[class*="product-card"], [class*="ProductCard"], .product-item',
  title: '[class*="title"], [class*="name"]',
  oldPrice: '[class*="old-price"], [class*="oldPrice"], s, del',
  newPrice: '[class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

function looksLikeProduct(item) {
  return item && (item.price !== undefined || item.salePrice !== undefined
    || item.title !== undefined || item.name !== undefined);
}

async function parse() {
  const html = await fetchHtml(PROMO_URL);
  const $ = cheerio.load(html);

  const nextData = extractNextData(html);
  if (nextData) {
    const arrays = deepFindArrays(nextData, looksLikeProduct);
    const products = [];
    for (const arr of arrays) {
      for (const item of arr) {
        const guessed = guessProduct(item, BASE_URL);
        if (guessed) products.push(guessed);
      }
    }
    if (products.length) {
      return products.map((p) => ({
        ...p,
        discount: computeDiscount(p.oldPrice, p.newPrice),
        category: 'electronics',
      }));
    }
  }

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({
    ...c,
    discount: computeDiscount(c.oldPrice, c.newPrice),
    category: 'electronics',
  }));
}

module.exports = { parse };
