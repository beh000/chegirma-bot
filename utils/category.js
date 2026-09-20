const CATEGORIES = {
  food: { emoji: '🍕🍔', ru: 'Еда', uz: 'Oziq-ovqat' },
  electronics: { emoji: '📱💻', ru: 'Электроника', uz: 'Elektronika' },
  clothes: { emoji: '👗👟', ru: 'Одежда', uz: 'Kiyim-kechak' },
  cosmetics: { emoji: '💄', ru: 'Косметика', uz: 'Kosmetika' },
  home: { emoji: '🏠', ru: 'Дом', uz: "Uy-ro'zg'or" },
  finance: { emoji: '💳', ru: 'Финансы', uz: 'Moliya' },
  other: { emoji: '🛒', ru: 'Разное', uz: 'Boshqa' },
};

// Ключевые слова для определения категории по названию товара, если
// сайт-источник не даёт свою категорию явно.
const KEYWORD_MAP = [
  {
    cat: 'electronics',
    words: ['телефон', 'смартфон', 'ноутбук', 'планшет', 'наушник', 'телевизор',
      'холодильник', 'стиральн', 'пылесос', 'принтер', 'монитор', 'iphone',
      'samsung', 'колонк', 'зарядк', 'powerbank', 'повербанк', 'видеокарт',
      'процессор', 'клавиатур', 'мышь', 'мышка', 'камера', 'фен', 'утюг',
      'микроволнов', 'кондиционер', 'планшет'],
  },
  {
    cat: 'clothes',
    words: ['футболк', 'куртк', 'платье', 'джинс', 'кроссовк', 'обувь',
      'ботинк', 'рубашк', 'брюки', 'кофт', 'толстовк', 'сумк', 'шапк',
      'носк', 'юбк'],
  },
  {
    cat: 'cosmetics',
    words: ['крем', 'шампунь', 'помад', 'парфюм', 'духи', 'тушь', 'лосьон',
      'сыворотк', 'маска для лица', 'косметик', 'гель для душа', 'дезодорант'],
  },
  {
    cat: 'home',
    words: ['диван', 'кроват', 'стол', 'стул', 'шкаф', 'посуд', 'сковород',
      'кастрюл', 'постельн', 'подушк', 'одеял', 'ковёр', 'ковер', 'мебель',
      'светильник'],
  },
  {
    cat: 'food',
    words: ['пицц', 'бургер', 'комбо', 'шаурм', 'напиток', 'кола', 'сок',
      'кофе', 'чай', 'десерт', 'суши', 'роллы', 'закуск'],
  },
  {
    cat: 'finance',
    words: ['кэшбек', 'кэшбэк', 'cashback', 'карт', 'кредит', 'вклад',
      'депозит', 'рассрочк'],
  },
];

function detectCategory(title = '', fallback = 'other') {
  const lower = title.toLowerCase();
  for (const { cat, words } of KEYWORD_MAP) {
    if (words.some((w) => lower.includes(w))) return cat;
  }
  return CATEGORIES[fallback] ? fallback : 'other';
}

function getCategoryInfo(catKey) {
  return CATEGORIES[catKey] || CATEGORIES.other;
}

module.exports = { CATEGORIES, detectCategory, getCategoryInfo };
