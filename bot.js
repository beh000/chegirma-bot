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

async function callTelegram(method, payload) {
  const res = await axios.post(`${API_BASE}/${method}`, payload, { timeout: 30000 });
  if (!res.data || res.data.ok !== true) {
    throw new Error(`Telegram API ${method}: ${JSON.stringify(res.data)}`);
  }
  return res.data.result;
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
    // Попытка 1: отдать Telegram ссылку на фото — он сам её скачивает,
    // для нас это бесплатно по трафику.
    try {
      if (shortCaption) {
        await callTelegram('sendPhoto', { chat_id: CHANNEL_ID, photo: deal.image, caption });
      } else {
        await callTelegram('sendPhoto', { chat_id: CHANNEL_ID, photo: deal.image });
        await callTelegram('sendMessage', { chat_id: CHANNEL_ID, text: caption });
      }
      return true;
    } catch (err) {
      console.warn(`[bot] Фото по ссылке не прошло для "${deal.title}": ${telegramErrorMessage(err)} — пробую скачать и загрузить файлом`);
    }

    // Попытка 2: скачиваем сами и грузим как файл (обходит хотлинк-защиту).
    try {
      await sendPhotoUpload(deal.image, shortCaption ? caption : null);
      if (!shortCaption) await callTelegram('sendMessage', { chat_id: CHANNEL_ID, text: caption });
      return true;
    } catch (err) {
      console.error(`[bot] Загрузка фото файлом тоже не прошла для "${deal.title}": ${telegramErrorMessage(err)}`);
    }
  }

  // Попытка 3: совсем без фото — лишь бы акция не потерялась.
  try {
    await callTelegram('sendMessage', { chat_id: CHANNEL_ID, text: caption });
    return true;
  } catch (err) {
    console.error(`[bot] Не удалось отправить пост "${deal.title}" даже текстом: ${telegramErrorMessage(err)}`);
    return false;
  }
}

module.exports = { publishDeal, buildCaption };
