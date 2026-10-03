const { callTelegram, telegramErrorMessage } = require('./bot');
const { getState, saveState } = require('./utils/state');

// Уведомления о сбоях в личку админу. Без них бот однажды почти неделю
// "работал" (процесс жив, Railway зелёный), но не публиковал ничего —
// падал Chrome, и узнать об этом можно было только из логов.
//
// Чат админа: ADMIN_CHAT_ID из переменных окружения, а если не задан —
// первый, кто напишет боту /start в личку (запоминается в state.json).
// Так не нужно вручную выяснять свой chat id.

const NO_POST_ALERT_HOURS = Number(process.env.NO_POST_ALERT_HOURS) || 12;
const ERROR_ALERT_REPEAT_HOURS = 6;
const HOUR = 60 * 60 * 1000;

function adminChatId() {
  return process.env.ADMIN_CHAT_ID || getState().adminChatId || null;
}

async function sendAdmin(text) {
  const chatId = adminChatId();
  if (!chatId) {
    console.warn(`[admin] Чат админа не задан, уведомление не отправлено: ${text.split('\n')[0]}`);
    return;
  }
  try {
    await callTelegram('sendMessage', { chat_id: chatId, text });
  } catch (err) {
    console.error(`[admin] Не удалось отправить уведомление: ${telegramErrorMessage(err)}`);
  }
}

// Ищет /start в личке бота. Вызывается в начале каждого цикла, пока админ
// не найден; после этого getUpdates больше не дёргается.
async function discoverAdmin() {
  if (adminChatId()) return;
  const state = getState();
  let updates;
  try {
    updates = await callTelegram('getUpdates', {
      offset: state.updateOffset || 0, timeout: 0, allowed_updates: ['message'],
    });
  } catch (err) {
    console.error(`[admin] getUpdates не удался: ${telegramErrorMessage(err)}`);
    return;
  }
  if (!updates.length) {
    if (!state.botUsername) {
      const me = await callTelegram('getMe', {}).catch(() => null);
      state.botUsername = me?.username || null;
      saveState();
    }
    console.log(`[admin] Чат админа не задан — напишите /start боту @${state.botUsername || '?'} в личку`);
    return;
  }

  state.updateOffset = updates[updates.length - 1].update_id + 1;
  const start = updates.find((u) => u.message?.chat?.type === 'private'
    && /^\/start\b/.test(u.message.text || ''));
  if (start) {
    state.adminChatId = String(start.message.chat.id);
    const who = start.message.from?.username ? `@${start.message.from.username}` : state.adminChatId;
    console.log(`[admin] Чат админа сохранён: ${who}`);
  }
  saveState();

  if (start) {
    await sendAdmin('✅ Уведомления о сбоях chegirma-bot включены.\n\n'
      + 'Сюда придёт сообщение, если какой-то сайт начнёт падать с ошибкой '
      + `или если бот ${NO_POST_ALERT_HOURS} ч подряд ничего не опубликует.`);
  }
}

// results: [{ name, error?, found, posted }] по каждому сайту за цикл.
async function reportCycle(results) {
  const state = getState();
  const now = Date.now();
  const postedTotal = results.reduce((sum, r) => sum + (r.posted || 0), 0);
  const failed = results.filter((r) => r.error);

  if (!state.lastPostAt) state.lastPostAt = now;

  if (postedTotal > 0) {
    state.lastPostAt = now;
    if (state.noPostAlertSent) {
      state.noPostAlertSent = false;
      await sendAdmin(`✅ Бот снова публикует: ${postedTotal} пост(ов) в последнем цикле.`);
    }
  } else if (!state.noPostAlertSent && now - state.lastPostAt > NO_POST_ALERT_HOURS * HOUR) {
    state.noPostAlertSent = true;
    const lines = results.map((r) => `• ${r.name}: ${r.error ? `ошибка — ${r.error}` : `найдено ${r.found}`}`);
    await sendAdmin(`⚠️ chegirma-bot: ${NO_POST_ALERT_HOURS} ч ни одного поста.\n\n`
      + `Последний цикл:\n${lines.join('\n')}`);
  }

  if (failed.length) {
    const signature = failed.map((r) => r.name).sort().join(',');
    const repeatDue = now - (state.errorAlertAt || 0) > ERROR_ALERT_REPEAT_HOURS * HOUR;
    if (signature !== state.errorAlertSignature || repeatDue) {
      state.errorAlertSignature = signature;
      state.errorAlertAt = now;
      const lines = failed.map((r) => `• ${r.name}: ${r.error}`);
      await sendAdmin(`❌ chegirma-bot: ошибки при проверке сайтов\n\n${lines.join('\n')}`);
    }
  } else if (state.errorAlertSignature) {
    state.errorAlertSignature = null;
    await sendAdmin('✅ chegirma-bot: ошибок при проверке сайтов больше нет.');
  }

  saveState();
}

module.exports = { discoverAdmin, reportCycle, sendAdmin };
