// Канал пока публикует только 3 категории — остальное намеренно не постим.
const CATEGORIES = {
  food: { emoji: '🍕🍔', ru: 'Еда', uz: 'Oziq-ovqat' },
  electronics: { emoji: '📱💻', ru: 'Техника', uz: 'Texnika' },
  clothes: { emoji: '👗👟', ru: 'Одежда', uz: 'Kiyim-kechak' },
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
      'микроволнов', 'кондиционер'],
  },
  {
    cat: 'clothes',
    words: ['футболк', 'куртк', 'платье', 'джинс', 'кроссовк', 'обувь',
      'ботинк', 'рубашк', 'брюки', 'кофт', 'толстовк', 'сумк', 'шапк',
      'носк', 'юбк'],
  },
  {
    cat: 'food',
    words: ['пицц', 'бургер', 'комбо', 'шаурм', 'напиток', 'кола', 'сок',
      'кофе', 'чай', 'десерт', 'суши', 'роллы', 'закуск'],
  },
];

// Возвращает food/electronics/clothes или null, если товар не подходит ни
// под одну из 3 разрешённых категорий — такие товары не публикуются
// (см. index.js: normalizeDeal отбрасывает deal без category).
function detectCategory(title = '') {
  const lower = title.toLowerCase();
  for (const { cat, words } of KEYWORD_MAP) {
    if (words.some((w) => lower.includes(w))) return cat;
  }
  return null;
}

function getCategoryInfo(catKey) {
  return CATEGORIES[catKey] || null;
}

module.exports = { CATEGORIES, detectCategory, getCategoryInfo };
