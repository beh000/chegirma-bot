const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'posted.json');
const MAX_RECORDS = 1000;

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FILE_PATH)) fs.writeFileSync(FILE_PATH, '{}', 'utf8');
}

function load() {
  ensureFile();
  try {
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (err) {
    console.error(`[storage] Не удалось прочитать posted.json, начинаю с пустого: ${err.message}`);
    return {};
  }
}

function persist(store) {
  ensureFile();
  fs.writeFileSync(FILE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function prune(store) {
  const entries = Object.entries(store);
  if (entries.length <= MAX_RECORDS) return store;
  entries.sort((a, b) => (a[1].postedAt || 0) - (b[1].postedAt || 0));
  const removeCount = entries.length - MAX_RECORDS;
  for (let i = 0; i < removeCount; i += 1) {
    delete store[entries[i][0]];
  }
  return store;
}

let cache = null;

function getCache() {
  if (!cache) cache = load();
  return cache;
}

function isPosted(id) {
  return Boolean(getCache()[id]);
}

function markPosted(id, meta = {}) {
  const store = getCache();
  store[id] = { postedAt: Date.now(), ...meta };
  prune(store);
  persist(store);
}

module.exports = { isPosted, markPosted };
