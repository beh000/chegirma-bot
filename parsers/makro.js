const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  parsePrice, computeDiscount, absoluteUrl,
} = require('../utils/parserHelpers');

// makro.uz не резолвился (ENOTFOUND) в первом деплое — реальный домен сети
// супермаркетов Makro найден через веб-поиск. Сайт на Next.js, товары
// рендерятся через JS — грузим headless-браузером.
const BASE_URL = 'https://makromarket.uz';
const PROMO_URL = 'https://makromarket.uz/promotions';

// Подтверждено вживую (INSPECT_BROWSER=1): карточка — <article>, старая
// (зачёркнутая) цена — <p class="... line-through ...">, новая — соседний
// <p class="... font-bold ..."> (Tailwind, без стабильного BEM-имени, зато
// служебные классы line-through/font-bold стабильны и не завязаны на
// сборку).
const CARD_SELECTOR = 'article';
const OLD_PRICE_SELECTOR = 'p.line-through';
const NEW_PRICE_SELECTOR = 'p[class*="font-bold"]:not(.line-through)';

async function parse() {
  const html = await fetchRendered(PROMO_URL, { waitForSelector: CARD_SELECTOR, timeout: 45000 });
  const $ = cheerio.load(html);

  const deals = [];
  $(CARD_SELECTOR).each((_, el) => {
    const card = $(el);
    const link = absoluteUrl(BASE_URL, card.find('a').first().attr('href'));
    const title = card.find('[class*="title"], [class*="name"], h3, h2').first().text().trim()
      || card.find('img').first().attr('alt')
      || '';
    const image = absoluteUrl(BASE_URL, card.find('img').first().attr('src'));
    const oldPrice = parsePrice(card.find(OLD_PRICE_SELECTOR).first().text());
    const newPrice = parsePrice(card.find(NEW_PRICE_SELECTOR).first().text());

    if (!title || !link || !newPrice) return;

    deals.push({
      title,
      oldPrice,
      newPrice,
      image,
      link,
      discount: computeDiscount(oldPrice, newPrice),
    });
  });

  return deals;
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
