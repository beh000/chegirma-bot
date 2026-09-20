const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  parsePrice, computeDiscount, absoluteUrl, extractJsonLdProducts, scrapeCards,
} = require('../utils/parserHelpers');

// makro.uz не резолвился (ENOTFOUND) в первом деплое — реальный домен сети
// супермаркетов Makro найден через веб-поиск.
const BASE_URL = 'https://makromarket.uz';
const PROMO_URL = 'https://makromarket.uz/promotions';

const SELECTORS = {
  item: '.product-item, .catalog-item, [class*="ProductCard"]',
  title: '.product-item__name, [class*="title"], [class*="name"]',
  oldPrice: '.product-item__old-price, [class*="oldPrice"], s, del',
  newPrice: '.product-item__price, [class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

// makromarket.uz — Next.js SPA, товары в исходном HTML отсутствуют (CSR) —
// грузим headless-браузером, чтобы получить страницу после JS-рендера.
async function parse() {
  const html = await fetchRendered(PROMO_URL, { waitForSelector: '[class*="price"]' });
  const $ = cheerio.load(html);

  const jsonLdProducts = extractJsonLdProducts($);
  if (jsonLdProducts.length) {
    return jsonLdProducts
      .map((p) => {
        const newPrice = parsePrice(p.offers?.price);
        const oldPrice = parsePrice(p.offers?.priceSpecification?.price);
        if (!p.name || !newPrice) return null;
        return {
          title: p.name,
          oldPrice,
          newPrice,
          discount: computeDiscount(oldPrice, newPrice),
          image: Array.isArray(p.image) ? p.image[0] : p.image,
          link: absoluteUrl(BASE_URL, p.url || p.offers?.url),
        };
      })
      .filter(Boolean);
  }

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({ ...c, discount: computeDiscount(c.oldPrice, c.newPrice) }));
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
