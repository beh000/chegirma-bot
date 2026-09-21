const cheerio = require('cheerio');
const { fetchRendered } = require('../utils/browser');
const {
  parsePrice, computeDiscount, absoluteUrl,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://uzum.uz';
// Подтверждено вживую (INSPECT_BROWSER=1): страница отдаёт реальные карточки
// товаров с ценами — никакой антибот-проверки headless-браузер не встретил
// (та "Верификация" ловилась только на обычном axios-запросе без куки/JS).
const PROMO_URL = 'https://uzum.uz/ru/discounts';

// Карточка — <a class="card product-card-MAIN-<id>_<n> product-card
// product-card--desktop">, лежит в div.products.
const CARD_SELECTOR = 'a.product-card--desktop';

// .card-price__lowest — цена, которую реально платит покупатель.
// .card-price__regular — цена "до скидки"; у части товаров с многоуровневой
// скидкой (карта Uzum + акция) внутри неё лежит ЕЩЁ один вложенный элемент
// .card-price--strikethrough с настоящей исходной ценой — если он есть,
// берём именно его, иначе .text() всего .card-price__regular.
function extractOldPrice(card) {
  const regular = card.find('.card-price__regular').first();
  const strikethrough = regular.find('.card-price--strikethrough').first();
  if (strikethrough.length) return parsePrice(strikethrough.text());
  return parsePrice(regular.text());
}

async function parse() {
  const html = await fetchRendered(PROMO_URL, {
    waitForSelector: CARD_SELECTOR,
    timeout: 45000,
  });
  const $ = cheerio.load(html);

  const deals = [];
  $(CARD_SELECTOR).each((_, el) => {
    const card = $(el);
    const link = absoluteUrl(BASE_URL, card.attr('href'));
    const title = card.find('[class*="title"]').first().text().trim()
      || card.attr('title')
      || card.find('img').first().attr('alt')
      || '';
    const image = absoluteUrl(BASE_URL, card.find('img').first().attr('src'));

    const newPrice = parsePrice(card.find('.card-price__lowest').first().text());
    const oldPrice = extractOldPrice(card);

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

module.exports = { parse, DEBUG_URLS: [PROMO_URL] };
