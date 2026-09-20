const cheerio = require('cheerio');
const { fetchHtml } = require('../utils/http');
const {
  parsePrice, computeDiscount, absoluteUrl, extractNextData,
  deepFindArrays, guessProduct, scrapeCards,
} = require('../utils/parserHelpers');

const BASE_URL = 'https://uzum.uz';
// В первом деплое /ru/discounts ушёл в "Maximum number of redirects
// exceeded" — похоже на region/session-редирект, требующий куки (теперь
// http.js хранит куки между запросами через cookie jar, должно чиниться
// само). Точный путь раздела скидок не удалось подтвердить веб-поиском —
// если после редеплоя снова 0 акций, пробуем и другие кандидаты по очереди.
const PROMO_CANDIDATES = [
  'https://uzum.uz/ru/discounts',
  'https://uzum.uz/ru',
];

// Uzum — SPA на React/Next.js, обычный HTML почти наверняка пустой.
// Порядок попыток: 1) __NEXT_DATA__ JSON  2) CSS-селекторы (запасной путь).
const SELECTORS = {
  item: '[class*="product-card"], [class*="ProductCard"]',
  title: '[class*="title"], [class*="name"]',
  oldPrice: '[class*="price"] s, [class*="oldPrice"], del',
  newPrice: '[class*="price"]:not(:has(s))',
  image: 'img',
  link: 'a',
};

function looksLikeProduct(item) {
  return item && (item.price !== undefined || item.salePrice !== undefined
    || item.title !== undefined || item.name !== undefined);
}

async function fetchFirstWorking(urls) {
  let lastErr;
  for (const url of urls) {
    try {
      return await fetchHtml(url);
    } catch (err) {
      lastErr = err;
      console.warn(`[Uzum] ${url} недоступен: ${err.message}`);
    }
  }
  throw lastErr;
}

async function parse() {
  const html = await fetchFirstWorking(PROMO_CANDIDATES);
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
      return products.map((p) => ({ ...p, discount: computeDiscount(p.oldPrice, p.newPrice) }));
    }
  }

  const cards = scrapeCards($, BASE_URL, SELECTORS);
  return cards.map((c) => ({ ...c, discount: computeDiscount(c.oldPrice, c.newPrice) }));
}

module.exports = { parse };
