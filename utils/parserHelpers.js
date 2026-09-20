const crypto = require('crypto');
const cheerio = require('cheerio');
const { fetchHtml } = require('./http');

function parsePrice(raw) {
  if (raw === null || raw === undefined) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

function computeDiscount(oldPrice, newPrice) {
  if (!oldPrice || !newPrice || oldPrice <= newPrice) return null;
  return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
}

function makeId(link, title, newPrice) {
  const base = link || `${title}|${newPrice}`;
  return crypto.createHash('sha256').update(String(base)).digest('hex');
}

function absoluteUrl(base, maybeRelative) {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, base).href;
  } catch {
    return null;
  }
}

function extractDateHint(text) {
  if (!text) return null;
  const match = text.match(/(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})/);
  return match ? match[1] : null;
}

async function loadPage(url) {
  const html = await fetchHtml(url);
  return { $: cheerio.load(html), html };
}

// Многие узбекские интернет-магазины (uzum.uz, texnomart.uz и т.п.)
// рендерят каталог через React/Next.js — в HTML нет данных напрямую,
// зато почти всегда есть этот JSON-блок со state страницы.
function extractNextData(html) {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractJsonLdProducts($) {
  const products = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).contents().text());
      const items = Array.isArray(json) ? json : [json];
      for (const item of items) {
        if (item['@type'] === 'Product') products.push(item);
        if (Array.isArray(item.itemListElement)) {
          for (const li of item.itemListElement) {
            if (li.item && li.item['@type'] === 'Product') products.push(li.item);
          }
        }
      }
    } catch {
      // битый JSON-LD блок — пропускаем
    }
  });
  return products;
}

// Универсальный сбор карточек товаров по CSS-селекторам. Селекторы для
// каждого сайта подобраны "на глаз" (без живого доступа к интернету при
// разработке) и почти наверняка потребуют донастройки после первого
// реального запуска — смотри README.md.
function scrapeCards($, baseUrl, cfg) {
  const results = [];
  $(cfg.item).each((_, el) => {
    const card = $(el);
    const title = cfg.title ? card.find(cfg.title).first().text().trim() : null;
    const oldPriceRaw = cfg.oldPrice ? card.find(cfg.oldPrice).first().text().trim() : null;
    const newPriceRaw = cfg.newPrice ? card.find(cfg.newPrice).first().text().trim() : null;
    const imgEl = cfg.image ? card.find(cfg.image).first() : null;
    const imageRaw = imgEl ? (imgEl.attr('src') || imgEl.attr('data-src')) : null;
    const linkRaw = cfg.link ? card.find(cfg.link).first().attr('href') : card.attr('href');

    const oldPrice = parsePrice(oldPriceRaw);
    const newPrice = parsePrice(newPriceRaw);
    const link = absoluteUrl(baseUrl, linkRaw);
    const image = absoluteUrl(baseUrl, imageRaw);
    const expiry = extractDateHint(card.text());

    if (!title || !newPrice || !link) return;

    results.push({ title, oldPrice, newPrice, image, link, expiry });
  });
  return results;
}

// Рекурсивно ищет внутри произвольного JSON (например __NEXT_DATA__)
// массивы объектов, часть которых удовлетворяет predicate — используется,
// чтобы найти список товаров внутри state страницы, не зная точной схемы.
function deepFindArrays(obj, predicate, results = [], seen = new Set()) {
  if (!obj || typeof obj !== 'object' || seen.has(obj)) return results;
  seen.add(obj);
  if (Array.isArray(obj)) {
    if (obj.length && obj.every((it) => it && typeof it === 'object') && obj.some(predicate)) {
      results.push(obj);
    }
    obj.forEach((it) => deepFindArrays(it, predicate, results, seen));
  } else {
    Object.values(obj).forEach((v) => deepFindArrays(v, predicate, results, seen));
  }
  return results;
}

// Экспериментальная эвристика: пытается угадать поля товара в объекте с
// неизвестной схемой, перебирая самые частые варианты именования полей
// в API узбекских интернет-магазинов. Возвращает null, если не хватает
// обязательных данных (название/цена/ссылка) — тогда вызывающий код
// должен откатиться на CSS-селекторы.
function guessProduct(obj, baseUrl) {
  const title = obj.title || obj.name || obj.productName || obj.nameRu || obj.nameUz;
  const newPriceRaw = obj.price ?? obj.salePrice ?? obj.newPrice
    ?? obj.currentPrice ?? obj.discountPrice ?? obj.sellPrice;
  const oldPriceRaw = obj.oldPrice ?? obj.basePrice ?? obj.fullPrice
    ?? obj.originalPrice ?? obj.priceOld ?? obj.regularPrice;
  const imageRaw = obj.image || obj.imageUrl || obj.photo || obj.thumbnail
    || (Array.isArray(obj.images) ? obj.images[0] : null)
    || (Array.isArray(obj.photos) ? obj.photos[0] : null);
  const slug = obj.slug || obj.url || obj.link || obj.id;

  const newPrice = parsePrice(newPriceRaw);
  const oldPrice = parsePrice(oldPriceRaw);
  if (!title || !newPrice || !slug) return null;

  const link = typeof slug === 'string' && slug.startsWith('http')
    ? slug
    : absoluteUrl(baseUrl, typeof slug === 'string' ? `/product/${slug}` : `/product/${String(slug)}`);
  if (!link) return null;

  const image = typeof imageRaw === 'string' ? absoluteUrl(baseUrl, imageRaw) : null;

  return {
    title: String(title), oldPrice, newPrice, image, link,
  };
}

module.exports = {
  parsePrice,
  computeDiscount,
  makeId,
  absoluteUrl,
  extractDateHint,
  loadPage,
  extractNextData,
  extractJsonLdProducts,
  scrapeCards,
  deepFindArrays,
  guessProduct,
};
