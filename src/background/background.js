import { resolveStreamUrl } from '../config.js';

const OFFSCREEN_PATH = 'src/offscreen/offscreen.html';
const WATCHDOG_ALARM = 'radio-watchdog';

let isToggling = false;

// ---------- Вспомогательные функции ----------

async function setupOffscreenDocument() {
  if (await chrome.offscreen.hasDocument()) return false; // already exists
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing audio for radio extension',
  });
  return true; // newly created
}

// Сообщение, адресованное именно offscreen-документу
function sendToOffscreen(message) {
  return chrome.runtime.sendMessage({ target: 'offscreen', ...message });
}

// Бейдж на иконке: ON — играет, ... — подключение/переподключение
function applyBadge(status) {
  let text = '';
  if (status === 'playing') text = 'ON';
  else if (status === 'connecting' || status === 'reconnecting') text = '...';
  chrome.action.setBadgeText({ text });
}

// "Пользователь хочет, чтобы радио играло" — хранится в session storage,
// потому что offscreen-документ Chrome может закрыть сам (см. watchdog ниже),
// а service worker засыпает и теряет переменные
async function setWantPlaying(value) {
  await chrome.storage.session.set({ wantPlaying: value });
  if (value) {
    // Периодически проверяем, что offscreen-документ жив (минимум — раз в 30 сек)
    chrome.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 0.5 });
  } else {
    chrome.alarms.clear(WATCHDOG_ALARM);
  }
}

async function getWantPlaying() {
  const result = await chrome.storage.session.get(['wantPlaying']);
  return result.wantPlaying === true;
}

async function applyVolume(volumePercent) {
  await sendToOffscreen({ action: 'setVolume', volume: volumePercent / 100 });
}

// Запустить поток. reconnect = true — это восстановление, а не новый запуск
async function startStream({ reconnect = false } = {}) {
  await setupOffscreenDocument();
  await setWantPlaying(true);

  const result = await chrome.storage.sync.get(['streamUrl']);
  const response = await sendToOffscreen({
    action: 'play',
    streamUrl: resolveStreamUrl(result.streamUrl),
    reconnect
  });

  chrome.storage.local.set({ lastPlayTime: Date.now() });
  applyBadge(response.status);
  return response.status;
}

async function stopStream() {
  await setWantPlaying(false);
  if (await chrome.offscreen.hasDocument()) {
    sendToOffscreen({ action: 'playStopFeedback' });
    await sendToOffscreen({ action: 'pause' });
  }
  applyBadge('stopped');
  return 'stopped';
}

// Текущий статус: stopped / connecting / reconnecting / playing
async function getStatus() {
  if (await chrome.offscreen.hasDocument()) {
    const response = await sendToOffscreen({ action: 'getState' });
    return response.status;
  }

  // Offscreen-документ закрыт, а пользователь хочет музыку —
  // Chrome закрывает такие документы после 30 сек тишины (например, без интернета)
  if (await getWantPlaying()) {
    recoverPlayback().catch(err => console.error('Recover failed:', err));
    return 'reconnecting';
  }
  return 'stopped';
}

// Восстановить воспроизведение, если оно должно идти, но не идёт
async function recoverPlayback() {
  if (!(await getWantPlaying())) return;

  if (!(await chrome.offscreen.hasDocument())) {
    console.log('Offscreen document is gone, restoring playback');
    applyBadge('reconnecting');
    const result = await chrome.storage.sync.get(['volume']);
    await setupOffscreenDocument();
    await applyVolume(result.volume !== undefined ? result.volume : 100);
    await startStream({ reconnect: true });
    return;
  }

  const response = await sendToOffscreen({ action: 'getState' });
  if (response.status === 'stopped') {
    await startStream({ reconnect: true });
  } else {
    applyBadge(response.status);
  }
}

// ---------- Основные действия ----------

async function toggleRadio() {
  if (isToggling) return 'busy';
  isToggling = true;

  try {
    // Радио считается включённым, даже если сейчас идёт переподключение
    if (await getWantPlaying()) {
      return await stopStream();
    }

    await setupOffscreenDocument();

    // Звук включения
    sendToOffscreen({ action: 'playFeedback' });

    const result = await chrome.storage.sync.get(['volume']);
    await applyVolume(result.volume !== undefined ? result.volume : 100);

    return await startStream();
  } finally {
    isToggling = false;
  }
}

async function startRadio() {
  await setupOffscreenDocument();

  const result = await chrome.storage.sync.get(['startupVolume']);
  const startupVolume = result.startupVolume !== undefined ? result.startupVolume : 100;

  await chrome.storage.sync.set({ volume: startupVolume });
  await applyVolume(startupVolume);

  return await startStream();
}

// ---------- Обработчики ----------

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Сообщения для offscreen-документа нас не касаются
  if (request.target === 'offscreen') return false;

  if (request.action === 'toggleAudio') {
    toggleRadio().then(status => {
      sendResponse({ status, isPlaying: status === 'playing' });
    });
    return true;

  } else if (request.action === 'getState') {
    Promise.all([
      getStatus(),
      chrome.storage.local.get(['lastPlayTime'])
    ]).then(([status, stored]) => {
      sendResponse({
        status,
        isPlaying: status === 'playing',
        lastPlayTime: stored.lastPlayTime || null
      });
    });
    return true;

  } else if (request.action === 'setVolume') {
    setupOffscreenDocument().then(() => {
      return sendToOffscreen({ action: 'setVolume', volume: request.volume });
    }).then(response => {
      sendResponse(response);
    });
    return true;

  } else if (request.action === 'streamStatus') {
    // Offscreen сообщает об изменении состояния потока — обновляем бейдж
    applyBadge(request.status);
    return false;
  }

  return false;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== WATCHDOG_ALARM) return;
  recoverPlayback().catch(err => console.error('Watchdog failed:', err));
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-radio") {
    toggleRadio();
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.action.setBadgeText({ text: '' });
  chrome.storage.sync.get(['autoplay'], function(result) {
    if (result.autoplay === true) {
      setTimeout(() => {
        startRadio();
      }, 1000);
    }
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  // После установки/обновления/перезагрузки расширения радио не играет
  chrome.action.setBadgeText({ text: '' });
  chrome.alarms.clear(WATCHDOG_ALARM);
  chrome.storage.session.set({ wantPlaying: false });
});

// Миграция: при каждом старте проверяем streamUrl в storage.
// Если там лежит устаревший адрес — заменяем на актуальный.
(async () => {
  const result = await chrome.storage.sync.get(['streamUrl']);
  const stored = result.streamUrl;
  const resolved = resolveStreamUrl(stored);
  if (stored !== resolved) {
    await chrome.storage.sync.set({ streamUrl: resolved });
    console.log('Migrated streamUrl:', stored, '->', resolved);
  }
})();
