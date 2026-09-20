const axios = require('axios');
const { getCategoryInfo } = require('./utils/category');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN не задан в переменных окружения');
if (!CHANNEL_ID) throw new Error('CHANNEL_ID не задан в переменных окружения');

// Пакет "node-telegram-bot-api" на npm сейчас — не привычная классическая
// библиотека, а другой, переписанный клиент с несовместимым API (ESM,
// другая структура экспортов); старая ветка 0.x тянет депрекейтед `request`
// с критическими уязвимостями (form-data/SSRF). Поэтому здесь напрямую
// вызывается Telegram Bot API через axios — Telegram умеет сам скачать
// фото по URL, так что multipart-загрузка тоже не нужна.
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function callTelegram(method, payload) {
  const res = await axios.post(`${API_BASE}/${method}`, payload, { timeout: 20000 });
  if (!res.data || res.data.ok !== true) {
    throw new Error(`Telegram API ${method}: ${JSON.stringify(res.data)}`);
  }
  return res.data.result;
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

async function publishDeal(deal) {
  const caption = buildCaption(deal);
  try {
    if (deal.image) {
      if (caption.length <= PHOTO_CAPTION_LIMIT) {
        await callTelegram('sendPhoto', { chat_id: CHANNEL_ID, photo: deal.image, caption });
      } else {
        // caption слишком длинный для фото-подписи — шлём фото и текст отдельно
        await callTelegram('sendPhoto', { chat_id: CHANNEL_ID, photo: deal.image });
        await callTelegram('sendMessage', { chat_id: CHANNEL_ID, text: caption });
      }
    } else {
      await callTelegram('sendMessage', { chat_id: CHANNEL_ID, text: caption });
    }
    return true;
  } catch (err) {
    console.error(`[bot] Не удалось отправить пост "${deal.title}": ${err.message}`);
    if (deal.image) {
      // Фото не загрузилось (битая ссылка / хотлинк-защита сайта) —
      // пробуем отправить хотя бы текстом, чтобы акция не потерялась.
      try {
        await callTelegram('sendMessage', { chat_id: CHANNEL_ID, text: caption });
        return true;
      } catch (err2) {
        console.error(`[bot] Текстовый фолбэк тоже не сработал: ${err2.message}`);
      }
    }
    return false;
  }
}

module.exports = { publishDeal, buildCaption };
