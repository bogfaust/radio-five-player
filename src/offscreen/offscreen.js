import { STREAM_URL } from '../config.js';

const audio = document.getElementById('audioPlayer');
audio.volume = 1.0;

const feedbackAudio = document.getElementById('feedbackPlayer');
feedbackAudio.volume = 0.7;

const stoppingAudio = document.getElementById('stoppingPlayer');
stoppingAudio.volume = 0.7;

// ---------- Настройки автопереподключения ----------

// Паузы между попытками переподключения (мс). Последнее значение повторяется
const RETRY_DELAYS = [1000, 2000, 3000, 5000];
// Сколько без движения звука считаем, что связь пропала (показываем "переподключение")
const STALL_NOTICE_MS = 3000;
// Сколько ждём звук после попытки подключения, прежде чем попробовать ещё раз
const CONNECT_TIMEOUT_MS = 8000;
// Как часто проверяем, идёт ли звук
const WATCHDOG_INTERVAL_MS = 1000;

// ---------- Состояние ----------

// stopped      — радио выключено
// connecting   — первое подключение после нажатия "включить"
// reconnecting — связь пропала, пытаемся восстановить
// playing      — звук идёт
let status = 'stopped';
let wantPlaying = false;      // пользователь хочет, чтобы радио играло
let streamUrl = STREAM_URL;
let retryCount = 0;
let retryTimer = null;
let lastTime = 0;             // последнее известное audio.currentTime
let lastProgressAt = 0;       // когда звук в последний раз двигался

function setStatus(newStatus) {
  if (status === newStatus) return;
  status = newStatus;
  console.log('Stream status:', status);
  // Сообщаем background (бейдж) и popup (если открыт)
  chrome.runtime.sendMessage({ action: 'streamStatus', status }).catch(() => {});
}

function clearRetryTimer() {
  clearTimeout(retryTimer);
  retryTimer = null;
}

// Одна попытка подключения к потоку
function connect() {
  if (!wantPlaying) return;
  clearRetryTimer();

  // Даём новой попытке свежее окно ожидания
  lastTime = 0;
  lastProgressAt = Date.now();

  // Для живого стрима canplay/canplaythrough могут не прийти,
  // поэтому просто меняем src и вызываем play()
  audio.pause();
  audio.src = streamUrl;

  audio.play()
    .then(() => {
      console.log('Playing:', streamUrl);
    })
    .catch(err => {
      // AbortError — мы сами прервали загрузку новой попыткой, это не ошибка
      if (err.name === 'AbortError') return;
      // NotSupportedError при потере сети — штатная ситуация (поток не загрузился),
      // поэтому пишем обычный лог, а не error, чтобы не засорять страницу ошибок расширения
      console.log(`Play failed (online: ${navigator.onLine}):`, err.name, err.message);
      scheduleRetry();
    });
}

// Запланировать повторную попытку (с нарастающей паузой)
function scheduleRetry() {
  if (!wantPlaying || retryTimer) return;

  setStatus('reconnecting');

  const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
  retryCount++;
  console.log(`Reconnect attempt #${retryCount} in ${delay} ms`);

  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, delay);
}

function stopPlayback() {
  wantPlaying = false;
  clearRetryTimer();
  retryCount = 0;
  audio.pause();
  audio.src = '';
  setStatus('stopped');
}

// ---------- События аудио ----------

audio.addEventListener('playing', () => {
  if (!wantPlaying) return;
  retryCount = 0;
  lastProgressAt = Date.now();
  setStatus('playing');
});

// Ошибка сети / потока
audio.addEventListener('error', () => {
  if (!wantPlaying) return; // src = '' при остановке тоже вызывает error
  // Код 4 (SRC_NOT_SUPPORTED) Chrome выдаёт и при обычном отсутствии сети
  const code = audio.error ? audio.error.code : 'unknown';
  console.log(`Audio error (online: ${navigator.onLine}, code: ${code}), will retry`);
  scheduleRetry();
});

// Живой поток не должен заканчиваться — значит соединение оборвалось
audio.addEventListener('ended', () => {
  if (!wantPlaying) return;
  scheduleRetry();
});

// Интернет вернулся — не ждём таймеров, подключаемся сразу
window.addEventListener('online', () => {
  if (wantPlaying && status !== 'playing') {
    console.log('Network is back, reconnecting now');
    retryCount = 0;
    connect();
  }
});

// Сторож: при пропаже интернета элемент <audio> часто не выдаёт ошибку,
// а просто замирает. Поэтому следим за тем, двигается ли звук.
setInterval(() => {
  if (!wantPlaying) return;

  const now = Date.now();

  if (!audio.paused && audio.currentTime !== lastTime) {
    lastTime = audio.currentTime;
    lastProgressAt = now;
    if (status !== 'playing') {
      retryCount = 0;
      setStatus('playing');
    }
    return;
  }

  const stalledFor = now - lastProgressAt;

  // Звук замер — показываем пользователю, что идёт восстановление
  if (status === 'playing' && stalledFor >= STALL_NOTICE_MS) {
    setStatus('reconnecting');
  }

  // Звук так и не пошёл — пробуем подключиться заново
  if (stalledFor >= CONNECT_TIMEOUT_MS && !retryTimer) {
    scheduleRetry();
  }
}, WATCHDOG_INTERVAL_MS);

// ---------- Сообщения от background ----------

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Обрабатываем только сообщения, адресованные offscreen-документу
  if (message.target !== 'offscreen') return false;

  if (message.action === 'playFeedback') {
    feedbackAudio.currentTime = 0;
    feedbackAudio.play().catch(err => console.log('Feedback sound error:', err));
    sendResponse({ status: 'ok' });

  } else if (message.action === 'playStopFeedback') {
    stoppingAudio.currentTime = 0;
    stoppingAudio.play().catch(err => console.log('Stop feedback sound error:', err));
    sendResponse({ status: 'ok' });

  } else if (message.action === 'play') {
    wantPlaying = true;
    streamUrl = message.streamUrl || STREAM_URL;
    retryCount = 0;
    // reconnect = true, когда background восстанавливает уже начатое воспроизведение
    setStatus(message.reconnect ? 'reconnecting' : 'connecting');
    connect();
    // Отвечаем сразу, не ждём play() — иначе канал закроется
    sendResponse({ status });

  } else if (message.action === 'pause') {
    stopPlayback();
    sendResponse({ status });

  } else if (message.action === 'getState') {
    sendResponse({ status });

  } else if (message.action === 'setVolume') {
    audio.volume = message.volume;
    sendResponse({ status: 'volume_set' });
  }

  return true;
});
