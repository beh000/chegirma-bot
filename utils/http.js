const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');

// Заголовки как у обычного браузера Chrome — часть сайтов блокирует
// запросы без нормального User-Agent / Accept-Language.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Общий cookie jar на все сайты: tough-cookie сам разграничивает куки по
// домену, так что утечки между сайтами нет. Без него некоторые сайты
// (замечено на uzum.uz) уходят в бесконечный редирект — они выставляют
// сессионную/регион-куку на первом ответе и ждут её на следующем запросе,
// а обычный axios без jar её не сохраняет.
const jar = new CookieJar();

const client = wrapper(axios.create({
  jar,
  withCredentials: true,
  timeout: 15000,
  headers: {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ru,uz;q=0.9,en;q=0.8',
  },
  maxRedirects: 5,
}));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url, { retries = 2, retryDelay = 2000 } = {}) {
  let lastErr;
  let origin;
  try {
    origin = new URL(url).origin;
  } catch {
    origin = undefined;
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await client.get(url, {
        headers: origin ? { Referer: `${origin}/` } : {},
      });
      return res.data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await delay(retryDelay);
    }
  }
  throw lastErr;
}

async function fetchJson(url, opts = {}) {
  const res = await client.get(url, {
    ...opts,
    headers: { Accept: 'application/json', ...(opts.headers || {}) },
  });
  return res.data;
}

module.exports = {
  client, fetchHtml, fetchJson, delay,
};
