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

function findHints($, limit = 12) {
  const seen = new Set();
  const hints = [];

  $('*').each((_, el) => {
    if (hints.length >= limit) return false;
    const node = $(el);
    const ownText = node.contents().filter((__, c) => c.type === 'text').text().trim();
    const cls = (node.attr('class') || '').trim();
    const looksLikePrice = ownText && PRICE_TEXT_RE.test(ownText);
    const classSaysPrice = /price|narx|сумм|cena/i.test(cls);
    if (!looksLikePrice && !classSaysPrice) return undefined;

    const key = `${el.tagName}.${cls}.${ownText.slice(0, 20)}`;
    if (seen.has(key)) return undefined;
    seen.add(key);

    hints.push(
      `  <${el.tagName}${cls ? ` class="${cls}"` : ''}> "${ownText.slice(0, 50)}"\n`
      + `    родители: ${classChain(node, $)}`,
    );
    return undefined;
  });

  return hints;
}

async function inspectUrl(label, url) {
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
    console.log(`[INSPECT] ${label}: найдено ${jsonLd.length} JSON-LD Product`);
  }

  const hints = findHints($);
  if (hints.length) {
    console.log(`[INSPECT] ${label}: похожие на цену элементы:\n${hints.join('\n')}`);
  } else {
    console.log(`[INSPECT] ${label}: ни цен, ни __NEXT_DATA__, ни JSON-LD не найдено. `
      + `Первые 400 символов HTML:\n${html.replace(/\s+/g, ' ').slice(0, 400)}`);
  }
}

module.exports = { inspectUrl };
