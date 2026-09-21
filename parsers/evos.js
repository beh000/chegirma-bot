const { fetchRendered } = require('../utils/browser');
const {
  parsePrice, extractNextData, absoluteUrl,
} = require('../utils/parserHelpers');

// zakaz.evos.uz — это не сайт заказа, а страница-хаб со ссылками на
// Telegram-бот/приложения/сайт (подтверждено INSPECT_TEXT_URL: там только
// "Выберите способ" — Telegram Bot, iOS, Android, evos.uz, телефон).
// Настоящее меню — на основном сайте evos.uz (Next.js), найден веб-поиском
// и подтверждён рендером страницы.
const BASE_URL = 'https://evos.uz';
const PROMO_URL = 'https://evos.uz/';

// evos.uz рендерит меню через __NEXT_DATA__.props.pageProps.sale — раздел
// "Aksiyalar" сайта. Подтверждено через INSPECT_JSON_URL/PATH: и sale, и
// полное меню (props.pageProps.getMenu.data.menu[].foods) содержат только
// одно поле цены — "dprice" — ни в одном товаре нет поля старой/базовой
// цены. То есть у EVOS "акции" — это просто подборка комбо по
// фиксированной цене, а не скидка % от полной цены: как у Texnomart и
// Dominos, это реальное отсутствие данных на сайте, а не ошибка парсинга.
// discount всегда будет null и normalizeDeal (index.js) их отфильтрует —
// это ожидаемо. Код оставлен в JSON-варианте (а не CSS-селекторах), чтобы
// если EVOS когда-нибудь добавит поле старой цены, публикации заработают
// сами по себе без переписывания парсера.
async function parse() {
  const html = await fetchRendered(PROMO_URL, { settleMs: 4000 });
  const nextData = extractNextData(html);
  const items = nextData?.props?.pageProps?.sale?.data;
  if (!Array.isArray(items)) return [];

  return items.map((item) => ({
    title: item.title,
    oldPrice: null,
    newPrice: parsePrice(item.dprice),
    discount: null,
    image: item.img || null,
    link: absoluteUrl(BASE_URL, `/product/${item.id}`),
    category: 'food',
  }));
}

module.exports = { parse, DEBUG_URL: PROMO_URL };
