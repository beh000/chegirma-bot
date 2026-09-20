const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, extractNextData,
  deepFindArrays, guessProduct, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://uzum.uz';
// ПРОВЕРИТЬ после деплоя: раздел скидок маркетплейса Uzum.
const PROMO_URL = 'https://uzum.uz/ru/discounts';

// Uzum — SPA на React/Next.js, обычный HTML почти наверняка пустой.
// Порядок попыток: 1) __NEXT_DATA__ JSON  2) CSS-селекторы (запасной путь).
const SELECTORS = {
  item: '[class*="product-card"], [class*="ProductCard"]',
  title: '[class*="title"], [class*="name"]',
  oldPrice: '[class*="price"] s, [class*="oldPrice"], del',
  newPrice: '[class*="price"]:not(:has(s))',
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
      return products.map((p) => ({ ...p, discount: computeDiscount(p.oldPrice, p.newPrice) }));
    }
  }

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({ ...c, discount: computeDiscount(c.oldPrice, c.newPrice) }));
}

module.exports = { parse };
