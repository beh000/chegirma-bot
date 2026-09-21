const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  parsePrice, computeDiscount, absoluteUrl,
} = require('../utils/parserHelpers');

// tezz.uz — интернет-магазин бытовой техники/электроники, найден веб-поиском
// как один из немногих крупных узбекских магазинов без Cloudflare-защиты
// (подтверждено INSPECT_TEXT_URL: страница грузится и рендерится обычным
// образом, без челленджа). Селекторы карточек — черновые, требуют
// донастройки через INSPECT_BROWSER=1 INSPECT_ONLY=Tezz.
const BASE_URL = 'https://tezz.uz';
const PROMO_URL = 'https://tezz.uz/akcii';

const CARD_SELECTOR = '.product-item, [class*="product-card"], [class*="ProductCard"]';
const OLD_PRICE_SELECTOR = '[class*="old"], s, del, .line-through';
const NEW_PRICE_SELECTOR = '[class*="price"]:not([class*="old"])';

async function parse() {
  const html = await fetchRendered(PROMO_URL, {
    waitForSelector: CARD_SELECTOR, timeout: 45000, selectorTimeout: 20000,
  });
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
