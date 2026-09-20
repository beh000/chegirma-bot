const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, extractJsonLdProducts,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://texnomart.uz';
// /uz/aksiyalar дал 404 в первом деплое — реальный путь найден веб-поиском
// и подтверждён вживую (200, 20 JSON-LD Product, реальная вёрстка карточки
// снята через INSPECT-CARD): контейнер .product-item-component, название
// в a.product-name h2, картинка img.product-image[data-src], текущая цена
// .product-price__current.
const PROMO_URL = 'https://texnomart.uz/katalog/akcii-i-skidki/';

const CARD_SELECTOR = '.product-item-component';

// На проверенной странице категории видна только текущая (уже сниженная)
// цена — зачёркнутой "старой" цены рядом с ней нет, поэтому selector ниже
// почти наверняка ничего не найдёт на этой конкретной странице. Оставлен
// на случай, если она появится в других разделах сайта: без неё скидку %
// посчитать нечем, и normalizeDeal в index.js такие товары не публикует.
const OLD_PRICE_SELECTOR = '.product-price__old, [class*="price"][class*="old"], s, del, .line-through';

function findOldPrices($) {
  const byLink = {};
  $(CARD_SELECTOR).each((_, el) => {
    const card = $(el);
    const href = card.find('a.product-name').attr('href');
    if (!href) return;
    const link = absoluteUrl(BASE_URL, href);
    const oldPrice = parsePrice(card.find(OLD_PRICE_SELECTOR).first().text());
    if (link && oldPrice) byLink[link] = oldPrice;
  });
  return byLink;
}

async function parse() {
  const html = await fetchHtml(PROMO_URL);
  const $ = cheerio.load(html);

  const oldPriceByLink = findOldPrices($);
  const jsonLdProducts = extractJsonLdProducts($);

  if (jsonLdProducts.length) {
    return jsonLdProducts
      .map((p) => {
        const newPrice = parsePrice(p.offers?.price);
        if (!p.name || !newPrice) return null;
        const link = absoluteUrl(BASE_URL, p.url || p.offers?.url);
        const oldPrice = (link && oldPriceByLink[link]) || null;
        return {
          title: p.name,
          oldPrice,
          newPrice,
          discount: computeDiscount(oldPrice, newPrice),
          image: Array.isArray(p.image) ? p.image[0] : p.image,
          link,
          category: 'electronics',
        };
      })
      .filter(Boolean);
  }

  // Фолбэк без JSON-LD — чистый CSS-скрейп по подтверждённой вёрстке.
  const cards = [];
  $(CARD_SELECTOR).each((_, el) => {
    const card = $(el);
    const title = card.find('a.product-name h2').first().text().trim();
    const href = card.find('a.product-name').attr('href');
    const link = absoluteUrl(BASE_URL, href);
    const imgEl = card.find('img.product-image').first();
    const image = absoluteUrl(BASE_URL, imgEl.attr('data-src') || imgEl.attr('src'));
    const newPrice = parsePrice(card.find('.product-price__current').first().text());
    const oldPrice = (link && oldPriceByLink[link]) || null;

    if (!title || !newPrice || !link) return;

    cards.push({
      title,
      oldPrice,
      newPrice,
      image,
      link,
      discount: computeDiscount(oldPrice, newPrice),
      category: 'electronics',
    });
  });

  return cards;
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
