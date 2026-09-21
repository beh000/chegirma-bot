const axios = require('axios');
const { client: httpClient } = require('./utils/http');
const { getCategoryInfo } = require('./utils/category');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN не задан в переменных окружения');
if (!CHANNEL_ID) throw new Error('CHANNEL_ID не задан в переменных окружения');

// Пакет "node-telegram-bot-api" на npm сейчас — не привычная классическая
// библиотека, а другой, переписанный клиент с несовместимым API (ESM,
// другая структура экспортов); старая ветка 0.x тянет депрекейтед `request`
// с критическими уязвимостями (form-data/SSRF). Поэтому здесь напрямую
// вызывается Telegram Bot API через axios.
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

function delay(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

// Каждый пост с фото, у которого не проходит вариант "по ссылке", стоит
// два обращения к Telegram API вместо одного (сначала неудачный sendPhoto
// по URL, потом ещё один — файлом) — при частой публикации это быстро
// упирается в лимит Telegram (429). Вместо того чтобы просто сдаваться,
// ждём ровно столько, сколько просит сам Telegram (retry_after), и
// пробуем ещё раз — так временный throttling не роняет публикацию.
async function callTelegram(method, payload, attempt = 0) {
  try {
    const res = await axios.post(`${API_BASE}/${method}`, payload, { timeout: 30000 });
    if (!res.data || res.data.ok !== true) {
      throw new Error(`Telegram API ${method}: ${JSON.stringify(res.data)}`);
    }
    return res.data.result;
  } catch (err) {
    const retryAfter = err.response?.data?.parameters?.retry_after;
    if (retryAfter && attempt < 2) {
      console.warn(`[bot] Telegram просит подождать ${retryAfter}с (429) перед ${method} — жду и пробую снова`);
      await delay((retryAfter + 1) * 1000);
      return callTelegram(method, payload, attempt + 1);
    }
    throw err;
  }
}

// Ошибку axios/Telegram по умолчанию логируем как бессмысленный
// "Request failed with status code 400" — Telegram обычно кладёт
// человекочитаемую причину в response.data.description, достаём её.
function telegramErrorMessage(err) {
  const desc = err.response?.data?.description;
  return desc ? `${err.message} — ${desc}` : err.message;
}

function formatPrice(n) {
  if (n === null || n === undefined) return '—';
  return Number(n).toLocaleString('ru-RU').replace(/,/g, ' ');
}

// Названия товаров (бренды, модели) намеренно не переводятся между
// русским и узбекским блоками — так делают все реальные каналы-агрегаторы,
// автоперевод названий товаров машинным переводом даёт мусор ("Samsung"
// превращается во что-то нечитаемое). Переводятся только подписи шаблона.
function buildCaption(deal) {
  const {
    title, oldPrice, newPrice, discount, category, store, expiry, link,
  } = deal;
  const info = getCategoryInfo(category);
  const emoji = info.emoji;

  const expiryRu = expiry || 'Пока действует';
  const expiryUz = expiry || "Amal qilgunga qadar";

  const ru = [
    `${emoji} ${title}`,
    '',
    `💰 ${formatPrice(oldPrice)} → ${formatPrice(newPrice)} сум`,
    `🔥 Скидка: -${discount}%`,
    '',
    `📦 Категория: ${info.ru}`,
    `🏪 Магазин: ${store}`,
    `⏰ До: ${expiryRu}`,
    '',
    `🔗 Купить: ${link}`,
  ].join('\n');

  const uz = [
    `${emoji} ${title}`,
    '',
    `💰 ${formatPrice(oldPrice)} → ${formatPrice(newPrice)} so'm`,
    `🔥 Chegirma: -${discount}%`,
    '',
    `📦 Kategoriya: ${info.uz}`,
    `🏪 Do'kon: ${store}`,
    `⏰ Muddat: ${expiryUz}`,
    '',
    `🔗 Sotib olish: ${link}`,
  ].join('\n');

  return `${ru}\n\n---\n\n${uz}\n\n@chegirma_official`;
}

const PHOTO_CAPTION_LIMIT = 1024;

// Многие сайты-источники (замечено на uzum.uz) блокируют хотлинк на CDN
// картинок без нормальных браузерных заголовков — Telegram, когда сам
// скачивает фото по URL, отправляет запрос без Referer/UA и получает от
// сайта отказ, а sendPhoto из-за этого падает с 400. Скачиваем картинку
// сами теми же заголовками, что и парсер, и заливаем в Telegram файлом.
async function downloadImage(url) {
  const origin = new URL(url).origin;
  const res = await httpClient.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
    headers: { Referer: `${origin}/` },
  });
  return {
    buffer: Buffer.from(res.data),
    contentType: res.headers['content-type'] || 'image/jpeg',
  };
}

async function sendPhotoUpload(imageUrl, caption) {
  const { buffer, contentType } = await downloadImage(imageUrl);
  const form = new FormData();
  form.append('chat_id', CHANNEL_ID);
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([buffer], { type: contentType }), 'photo.jpg');
  return callTelegram('sendPhoto', form);
}

async function publishDeal(deal) {
  const caption = buildCaption(deal);
  const shortCaption = caption.length <= PHOTO_CAPTION_LIMIT;

  if (deal.image) {
    // Сразу качаем сами и грузим файлом: у "по ссылке" (Telegram сам
    // фетчит URL без Referer/UA) на практике почти 100% отказ на сайтах с
    // хотлинк-защитой (замечено на uzum.uz — "failed to get HTTP URL
    // content"), а держать оба варианта означало 2 запроса к Telegram API
    // на пост и лишний 429 при частой публикации.
    try {
      await sendPhotoUpload(deal.image, shortCaption ? caption : null);
      if (!shortCaption) await callTelegram('sendMessage', { chat_id: CHANNEL_ID, text: caption });
      return true;
    } catch (err) {
      console.error(`[bot] Загрузка фото файлом не прошла для "${deal.title}": ${telegramErrorMessage(err)} — публикую текстом`);
    }
  }

  // Фолбэк: совсем без фото — лишь бы акция не потерялась.
  try {
    await callTelegram('sendMessage', { chat_id: CHANNEL_ID, text: caption });
    return true;
  } catch (err) {
    console.error(`[bot] Не удалось отправить пост "${deal.title}" даже текстом: ${telegramErrorMessage(err)}`);
    return false;
  }
}

module.exports = { publishDeal, buildCaption };
