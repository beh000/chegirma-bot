const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, extractJsonLdProducts, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://asaxiy.uz';
// /aksiya дал 403 в первом деплое — реальный раздел скидок найден веб-поиском.
// Основной ассортимент Asaxiy — книги/канцелярия, под 3 разрешённые категории
// (еда/одежда/техника) попадёт в основном их электроника.
const PROMO_URL = 'https://asaxiy.uz/product/product-list=super-price';

const SELECTORS = {
  item: '.product-card, [class*="ProductCard"], .catalog-item',
  title: '.product-card__title, [class*="title"], [class*="name"]',
  oldPrice: '.product-card__old-price, [class*="oldPrice"], s, del',
  newPrice: '.product-card__price, [class*="price"]:not([class*="old"])',
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

module.exports = { parse, DEBUG_URL: PROMO_URL };
