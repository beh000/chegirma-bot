const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  parsePrice, computeDiscount, absoluteUrl, extractJsonLdProducts, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://korzinka.uz';
// Найдено через веб-поиск (в первом деплое /promotions дал 403 — пути не
// существовало). id=256 — раздел "ежедневные скидки и акции".
const PROMO_URL = 'https://korzinka.uz/ru/catalog/special?id=256';

// korzinka.uz отвечает 403 на обычный axios-запрос (WAF/антибот) — грузим
// страницу настоящим headless-браузером (Playwright), он же может помочь
// дождаться JS-рендера каталога.
// Best-effort селекторы — реальные классы карточек нужно подсмотреть в
// логах после первого запуска (см. README про INSPECT=1).
const SELECTORS = {
  item: '.promotion-card, .product-card, [class*="ProductCard"]',
  title: '.product-card__title, [class*="title"], [class*="name"]',
  oldPrice: '.product-card__old-price, [class*="oldPrice"], s, del',
  newPrice: '.product-card__price, [class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

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
        };
      })
      .filter(Boolean);
  }

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({ ...c, discount: computeDiscount(c.oldPrice, c.newPrice) }));
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
