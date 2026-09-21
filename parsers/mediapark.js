const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  parsePrice, computeDiscount, absoluteUrl, extractJsonLdProducts, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://mediapark.uz';
// /uz/aksiyalar дал 403 в первом деплое — подтверждённый веб-поиском
// раздел скидок называется /discount.
const PROMO_URL = 'https://mediapark.uz/discount';

const SELECTORS = {
  item: '.product-card, [class*="ProductCard"], .catalog-item',
  title: '.product-card__title, [class*="title"], [class*="name"]',
  oldPrice: '.product-card__old-price, [class*="oldPrice"], s, del',
  newPrice: '.product-card__price, [class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

// mediapark.uz отвечает 403 на обычный axios-запрос — грузим headless-браузером.
async function parse() {
  const html = await fetchRendered(PROMO_URL, { waitForSelector: '[class*="price"]', timeout: 45000 });
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
          category: 'electronics',
        };
      })
      .filter(Boolean);
  }

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({
    ...c,
    discount: computeDiscount(c.oldPrice, c.newPrice),
    category: 'electronics',
  }));
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
