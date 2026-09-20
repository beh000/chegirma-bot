const cheerio = require('cheerio');
const { fetchHtml } = require('./http');
const { extractNextData, extractJsonLdProducts } = require('./parserHelpers');

// Диагностический режим (запускается при INSPECT=1) — вместо того чтобы
// гадать CSS-селекторы, скачивает реальную страницу через настоящий
// интернет-доступ Railway и вытаскивает подсказки о структуре прямо в
// логи деплоя, которые видны без браузерного доступа к сайту.
const PRICE_TEXT_RE = /\d{3}[\d\s.,]*\s*(сум|so'?m|so‘m|uzs)/i;

function classChain(node, $, depth = 4) {
  const chain = [];
  let cur = node.parent();
  for (let i = 0; i < depth; i += 1) {
    if (!cur || !cur.length || cur.get(0).type !== 'tag') break;
    const tag = cur.get(0).tagName;
    const cls = (cur.attr('class') || '').trim();
    chain.push(cls ? `${tag}.${cls.split(/\s+/).join('.')}` : tag);
    cur = cur.parent();
  }
  return chain.join(' < ') || '(нет родителей с классами)';
}

// Берём ПОЛНЫЙ текст (вместе с потомками), а не только прямые текстовые
// узлы — иначе пропускаем случаи вида <span>50 000</span><span>сум</span>,
// где цифры и валюта лежат в разных дочерних тегах.
function findHints($, limit = 15) {
  const seen = new Set();
  const hints = [];

  $('*').each((_, el) => {
    if (hints.length >= limit) return false;
    const node = $(el);
    const text = node.text().trim().replace(/\s+/g, ' ');
    const cls = (node.attr('class') || '').trim();
    const descendantCount = node.find('*').length;
    const compact = text.length > 0 && text.length < 80 && descendantCount <= 3;

    const looksLikePrice = compact && PRICE_TEXT_RE.test(text);
    const classSaysPrice = compact && /price|narx|нарх|сумм/i.test(cls);
    if (!looksLikePrice && !classSaysPrice) return undefined;

    const key = `${el.tagName}.${cls}.${text.slice(0, 20)}`;
    if (seen.has(key)) return undefined;
    seen.add(key);

    hints.push(
      `  <${el.tagName}${cls ? ` class="${cls}"` : ''}> "${text.slice(0, 60)}" (потомков: ${descendantCount})\n`
      + `    родители: ${classChain(node, $)}`,
    );
    return undefined;
  });

  return hints;
}

async function inspectUrl(label, url, { hintLimit = 12 } = {}) {
  console.log(`\n--- [INSPECT] ${label} → ${url} ---`);
  let html;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.log(`[INSPECT] ${label}: запрос упал — ${err.message}`);
    return;
  }

  console.log(`[INSPECT] ${label}: получено ${html.length} байт HTML`);

  const $ = cheerio.load(html);

  const nextData = extractNextData(html);
  if (nextData) {
    console.log(`[INSPECT] ${label}: найден __NEXT_DATA__, верхнеуровневые ключи props.pageProps: `
      + `${Object.keys(nextData?.props?.pageProps || {}).join(', ') || '(пусто)'}`);
  }

  const jsonLd = extractJsonLdProducts($);
  if (jsonLd.length) {
    console.log(`[INSPECT] ${label}: найдено ${jsonLd.length} JSON-LD Product, пример: `
      + `${JSON.stringify(jsonLd[0]).slice(0, 500)}`);
  }

  const hints = findHints($, hintLimit);
  if (hints.length) {
    console.log(`[INSPECT] ${label}: похожие на цену элементы:\n${hints.join('\n')}`);
  } else {
    console.log(`[INSPECT] ${label}: ни цен, ни __NEXT_DATA__, ни JSON-LD не найдено. `
      + `Первые 400 символов HTML:\n${html.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

// Достаёт HTML первого элемента, подходящего под selector — чтобы увидеть
// РЕАЛЬНУЮ структуру одной карточки товара целиком, а не догадки по кускам.
async function dumpCard(label, url, selector, maxLen = 2500) {
  console.log(`\n--- [INSPECT-CARD] ${label} selector="${selector}" ---`);
  let html;
  try {
    html = await fetchHtml(url);
  } catch (err) {
    console.log(`[INSPECT-CARD] ${label}: запрос упал — ${err.message}`);
    return;
  }
  const $ = cheerio.load(html);
  const el = $(selector).first();
  if (!el.length) {
    console.log(`[INSPECT-CARD] ${label}: селектор "${selector}" ничего не нашёл`);
    return;
  }
  const outer = $.html(el);
  console.log(`[INSPECT-CARD] ${label}: длина карточки ${outer.length} символов, показываю первые ${maxLen}:\n${outer.slice(0, maxLen)}`);
}

module.exports = { inspectUrl, dumpCard };
