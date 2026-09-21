const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  computeDiscount, extractNextData, deepFindArrays, guessProduct, scrapeCards,
} = require('../utils/parserHelpers');

// zakaz.evos.uz — это не сайт заказа, а страница-хаб со ссылками на
// Telegram-бот/приложения/сайт (подтверждено INSPECT_TEXT_URL: там только
// "Выберите способ" — Telegram Bot, iOS, Android, evos.uz, телефон).
// Настоящее меню с разделом "Aksiyalar" и ценами — на основном сайте
// evos.uz (Next.js), найден веб-поиском + подтверждён текстовым дампом
// отрендеренной страницы.
const BASE_URL = 'https://evos.uz';
const PROMO_URL = 'https://evos.uz/';

const SELECTORS = {
  item: '.promo-card, [class*="PromoCard"], [class*="product-card"], .card',
  title: '.promo-card__title, [class*="title"], h3',
  oldPrice: '[class*="oldPrice"], s, del',
  newPrice: '[class*="price"]:not([class*="old"])',
  image: 'img',
  link: 'a',
};

function looksLikeProduct(item) {
  return item && (item.price !== undefined || item.salePrice !== undefined
    || item.title !== undefined || item.name !== undefined);
}

// zakaz.evos.uz отдал пустую SPA-оболочку (864 байта) без JS — грузим
// headless-браузером. При первой проверке даже после рендера меню не
// появлялось за 10с — вероятно, сайту сначала нужно выбрать город/точку
// доставки; даём больше времени на гидратацию (settleMs) на случай, если
// дело просто в медленной загрузке, а не в обязательном шаге навигации.
async function parse() {
  const html = await fetchRendered(PROMO_URL, {
    waitForSelector: '[class*="price"]',
    timeout: 45000,
    selectorTimeout: 20000,
    settleMs: 6000,
  });
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
        category: 'food',
      }));
    }
  }

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({
    ...c,
    discount: computeDiscount(c.oldPrice, c.newPrice),
    category: 'food',
  }));
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
