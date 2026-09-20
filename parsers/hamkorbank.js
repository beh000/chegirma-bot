const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://hamkorbank.uz';
// ПРОВЕРИТЬ после деплоя: реальный путь раздела кэшбэка/акций банка.
const PROMO_URL = 'https://hamkorbank.uz/promotions';

const SELECTORS = {
  item: '.promo-card, [class*="PromoCard"], .card, .news-card',
  title: '.promo-card__title, [class*="title"], h3',
  oldPrice: '[class*="oldPrice"], s, del',
  newPrice: '[class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

// ВАЖНО: банковские акции у Hamkorbank почти всегда оформлены как
// "кэшбэк X% при оплате картой", а не как "старая цена → новая цена"
// конкретного товара. Заданный шаблон постов канала требует обе цены,
// поэтому такие предложения без явных цифр цены здесь намеренно
// отфильтровываются (см. index.js: normalizeDeal отбрасывает записи без
// newPrice/discount). Если нужно публиковать чистый кэшбэк без цены —
// это отдельное решение по формату поста, обсудить с автором бота.
async function parse() {
  const html = await fetchHtml(PROMO_URL);
  const $ = cheerio.load(html);

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({
    ...c,
    discount: computeDiscount(c.oldPrice, c.newPrice),
    category: 'finance',
  }));
}

module.exports = { parse };
