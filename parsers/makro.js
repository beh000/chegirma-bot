const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, extractJsonLdProducts, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://makro.uz';
// ПРОВЕРИТЬ после деплоя: реальный путь раздела акций гипермаркета Makro.
const PROMO_URL = 'https://makro.uz/aksiya';

const SELECTORS = {
  item: '.product-item, .catalog-item, [class*="ProductCard"]',
  title: '.product-item__name, [class*="title"], [class*="name"]',
  oldPrice: '.product-item__old-price, [class*="oldPrice"], s, del',
  newPrice: '.product-item__price, [class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

async function parse() {
  const html = await fetchHtml(PROMO_URL);
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

module.exports = { parse };
