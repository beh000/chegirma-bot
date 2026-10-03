const { fetchJson } = require('../utils/http');

const BASE_URL = 'https://makromarket.uz';
const PROMO_URL = `${BASE_URL}/promotions`;
// Сайт сам берёт акционные товары из этого JSON API (найдено перехватом
// сетевых запросов страницы /promotions). У каждого товара есть и старая,
// и новая цена, и процент — в отличие от вёрстки, которая меняется
// (старые CSS-селекторы на 2026-10-03 перестали находить карточки, хотя
// акций было 161).
const API_URL = 'https://api.makromarket.uz/api/v2/product-list/';
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

// Makro — супермаркет: почти всё в акциях — еда и напитки, но попадается
// бытовая химия и гигиена, которую нельзя постить как "Еду".
const NON_FOOD_RE = new RegExp([
  'ополаскив', 'зубн', 'щётк', 'щетк', 'нить для', 'шампун', 'бальзам для', 'кондиционер для',
  'гель для', 'мыл[оа]', 'жидкое мыло', 'порош', 'капсулы для', 'отбелив', 'чистящ', 'моющ',
  'средство для', 'салфет', 'туалетн', 'бумажн', 'полотенц', 'подгуз', 'прокладк', 'тампон',
  'дезодор', 'антиперсп', 'крем для', 'лосьон', 'маска для', 'бритв', 'пена для', 'освежител',
  'корм для', 'наполнител', 'губк', 'пакеты для', 'фольг', 'батарейк', 'лампочк',
].join('|'), 'i');

function toDeal(item) {
  const text = `${item.title || ''} ${item.category_title || ''}`;
  return {
    id: `makro-${item.id}-${item.endDate || ''}`,
    title: item.title,
    oldPrice: item.oldPrice || null,
    newPrice: item.newPrice || null,
    discount: item.percent || null,
    image: item.photo_medium || null,
    link: PROMO_URL,
    category: NON_FOOD_RE.test(text) ? null : 'food',
    expiry: item.endDate ? item.endDate.split('-').reverse().join('.') : null,
  };
}

async function parse() {
  const items = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // eslint-disable-next-line no-await-in-loop
    const data = await fetchJson(`${API_URL}?p=1&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`, {
      headers: { 'Accept-Language': 'ru', Referer: `${BASE_URL}/` },
    });
    items.push(...(data.results || []));
    if (!data.next) break;
  }
  return items
    .filter((item) => item.status === 1 && !item.is_adult)
    .map(toDeal);
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
