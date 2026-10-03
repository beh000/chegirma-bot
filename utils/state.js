const fs = require('fs');
const path = require('path');

// Служебное состояние бота (не история постов — она в posted.json):
// чат админа для уведомлений, время последнего поста, какие уведомления уже
// отправлены, когда последний раз постилась каждая линейка товаров. Лежит
// в data/ на Railway Volume, чтобы переживать редеплои.
const FILE_PATH = path.join(__dirname, '..', 'data', 'state.json');

let cache = null;

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function getState() {
  if (!cache) cache = load();
  return cache;
}

function saveState() {
  fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true });
  fs.writeFileSync(FILE_PATH, JSON.stringify(getState(), null, 2), 'utf8');
}

module.exports = { getState, saveState };
