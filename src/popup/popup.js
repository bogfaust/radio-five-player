import { API_BASE, STREAM_DELAY as DEFAULT_STREAM_DELAY } from '../config.js';

// Translations
const translations = {
  ru: {
    title: "Radio Player",
    play: "Включить радио",
    stop: "Выключить радио",
    settings: "Настройки",
    likedList: "♥ Понравившиеся",
    website: "🌐 radiofive.ru",
    volume: "Громкость",
    nowPlaying: "Сейчас играет",
    liked: "♥",
    like: "♡",
    loading: "Загрузка...",
    unknown: "—",
    jingle: "Джингл",
    connecting: "Подключение...",
    reconnecting: "Связь потеряна, восстанавливаем..."
  },
  en: {
    title: "Radio Player",
    play: "Play Radio",
    stop: "Stop Radio",
    settings: "Settings",
    likedList: "♥ Liked Songs",
    website: "🌐 radiofive.ru",
    volume: "Volume",
    nowPlaying: "Now playing",
    liked: "♥",
    like: "♡",
    loading: "Loading...",
    unknown: "—",
    jingle: "Jingle",
    connecting: "Connecting...",
    reconnecting: "Connection lost, reconnecting..."
  }
};

let currentLanguage = 'ru';
let currentVolume = 100;

// Now playing state
let currentSong = null;
let songStartTime = null;
let nextFetchTimeout = null;
let progressInterval = null;
let likedSongs = {};  // { [id]: { id, artist, title, likedAt } }
let lastPlayTime = null;
let csrfToken = null;  // Токен берём из <meta name="_csrf"> страницы сайта
let csrfHeaderName = 'X-CSRF-TOKEN';  // Имя заголовка, сервер сообщает его в <meta name="_csrf_header">
let streamDelay = 16;  // Задержка потока в секундах
let currentStatus = 'stopped';  // stopped / connecting / reconnecting / playing

// Load settings
chrome.storage.sync.get(['language', 'volume', 'streamDelay'], function(result) {
  currentLanguage = result.language || 'ru';
  currentVolume = result.volume !== undefined ? result.volume : 100;
  streamDelay = result.streamDelay !== undefined ? result.streamDelay : DEFAULT_STREAM_DELAY;
  updatePopupLanguage();
  updateVolumeUI();
});

// Load liked songs from local storage
// Формат: { [id]: { id, artist, title, likedAt } }
chrome.storage.local.get(['likedSongs'], function(result) {
  if (result.likedSongs) {
    // Поддержка старого формата (массив айди) и нового (объект)
    if (Array.isArray(result.likedSongs)) {
      result.likedSongs.forEach(id => likedSongs[id] = { id });
    } else {
      likedSongs = result.likedSongs;
    }
  }
});

function t(key) {
  return (translations[currentLanguage] || translations.ru)[key] || key;
}

function updatePopupLanguage() {
  document.getElementById('title').textContent = t('title');
  document.getElementById('openSettings').textContent = t('settings');
  document.getElementById('websiteLink').textContent = t('website');
  document.getElementById('volumeLabel').textContent = t('volume');
  document.getElementById('nowPlayingLabel').textContent = t('nowPlaying');
  document.getElementById('openLiked').textContent = t('likedList');
  renderStatus();
}

// Обновляет кнопку и строку статуса под текущее состояние потока
function renderStatus() {
  const toggleButton = document.getElementById('toggleButton');
  const connStatus = document.getElementById('connStatus');
  const connStatusText = document.getElementById('connStatusText');
  if (!toggleButton || !connStatus) return;

  // Пока идёт подключение, кнопка остаётся "Выключить" — чтобы можно было отменить
  const isActive = currentStatus !== 'stopped';
  const isBusy = currentStatus === 'connecting' || currentStatus === 'reconnecting';

  toggleButton.textContent = isActive ? t('stop') : t('play');
  toggleButton.classList.toggle('reconnecting', isBusy);

  connStatus.hidden = !isBusy;
  if (isBusy) connStatusText.textContent = t(currentStatus);
}

function setStatus(status) {
  currentStatus = status || 'stopped';
  renderStatus();
}

function updateVolumeUI() {
  const slider = document.getElementById('volumeSlider');
  const valueDisplay = document.getElementById('volumeValue');
  slider.value = currentVolume;
  valueDisplay.textContent = currentVolume + '%';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function updateProgressBar() {
  if (!currentSong || !songStartTime) return;

  const elapsed = (Date.now() - songStartTime) / 1000;
  const duration = currentSong.duration || 1;

  // elapsed < 0 означает что песня в эфире уже идёт, но до ушей ещё не дошла
  // (буферная задержка). Показываем пустой прогресс и 0:00 пока не дойдёт.
  if (elapsed < 0) {
    document.getElementById('trackBarFill').style.width = '0%';
    document.getElementById('trackElapsed').textContent = '0:00';
    document.getElementById('trackDuration').textContent = formatTime(duration);
    return;
  }

  const progress = Math.min(elapsed / duration, 1);
  document.getElementById('trackBarFill').style.width = (progress * 100) + '%';
  document.getElementById('trackElapsed').textContent = formatTime(Math.min(elapsed, duration));
  document.getElementById('trackDuration').textContent = formatTime(duration);
}

function renderSong(song) {
  const artistEl = document.getElementById('trackArtist');
  const titleEl = document.getElementById('trackTitle');
  const likeBtnEl = document.getElementById('likeBtn');

  // Джинглы сервер отдаёт с id === null
  const isJingle = song.id === null;

  if (isJingle) {
    artistEl.textContent = t('jingle');
    titleEl.textContent = '';
    titleEl.style.display = 'none';
    artistEl.style.marginRight = '0';
    likeBtnEl.style.visibility = 'hidden';
  } else {
    artistEl.textContent = song.artist || t('unknown');
    titleEl.textContent = song.title || '';
    titleEl.style.display = song.title ? 'inline' : 'none';
    artistEl.style.marginRight = song.title ? '' : '0';
    likeBtnEl.style.visibility = 'visible';
    const isLiked = !!likedSongs[song.id];
    likeBtnEl.textContent = isLiked ? t('liked') : t('like');
    likeBtnEl.classList.toggle('liked', isLiked);
    likeBtnEl.dataset.songId = song.id;
  }
}

// Читаем токен из заголовков ответа (на случай если сервер его там присылает)
function extractCsrfFromHeaders(resp) {
  const headerNames = ['x-csrf-token', 'csrf-token', 'x-xsrf-token', 'xsrf-token'];
  for (const name of headerNames) {
    const value = resp.headers.get(name);
    if (value) return value;
  }
  return null;
}

// Читаем токен из кук — перебираем все куки сайта и ищем UUID-образный токен
async function getCsrfTokenFromCookies() {
  const allCookies = await chrome.cookies.getAll({ url: API_BASE });

  // Сначала ищем по известным именам
  const knownNames = ['XSRF-TOKEN', 'csrf_token', 'csrftoken', '_csrf', 'csrf'];
  for (const name of knownNames) {
    const c = allCookies.find(c => c.name === name);
    if (c) return c.value;
  }

  // Если не нашли по имени — ищем куку со значением похожим на UUID
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const skipNames = /^(JSESSIONID|_ga|_gid|_ym)/;
  for (const c of allCookies) {
    if (!skipNames.test(c.name) && uuidRe.test(c.value)) return c.value;
  }

  return null;
}

// Ищем токен в тексте HTML страницы
function findCsrfInHtml(html) {
  // <meta name="_csrf" content="uuid" />
  let m = html.match(/<meta[^>]+name=["']_?csrf["'][^>]+content=["']([^"']{8,})["'][^>]*>/i);
  if (m) return m[1];

  // Атрибуты в обратном порядке: <meta content="..." name="_csrf">
  m = html.match(/<meta[^>]+content=["']([^"']{8,})["'][^>]+name=["']_?csrf["'][^>]*>/i);
  if (m) return m[1];

  // window._csrf = "..." или var _csrf = "..." или csrfToken = "..."
  m = html.match(/(?:window\._?csrf(?:Token)?|var\s+_?csrf(?:Token)?|\bcsrfToken)\s*[=:]\s*["']([^"']{8,})["']/i);
  if (m) return m[1];

  // Любое значение в кавычках рядом со словом csrf
  m = html.match(/csrf[^"']{0,30}["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i);
  if (m) return m[1];

  return null;
}

async function fetchCsrfTokenFromPage() {
  // Пробуем несколько страниц: сначала лёгкий /head, потом главную
  const paths = ['/head', '/'];
  for (const path of paths) {
    try {
      const resp = await fetch(`${API_BASE}${path}`, { credentials: 'include' });

      // Токен мог прийти в заголовках этого ответа
      const headerToken = extractCsrfFromHeaders(resp);
      if (headerToken) return headerToken;

      const html = await resp.text();
      const token = findCsrfInHtml(html);
      if (token) {
        // Имя заголовка (по умолчанию X-CSRF-TOKEN)
        const h = html.match(/<meta[^>]+name=["']_csrf_header["'][^>]+content=["']([^"']+)["']/i);
        if (h) csrfHeaderName = h[1];
        return token;
      }

      // Диагностика: показываем, что реально вернул сервер
      console.warn(`CSRF not found in ${path}:`, {
        status: resp.status,
        finalUrl: resp.url,
        redirected: resp.redirected,
        contentType: resp.headers.get('content-type'),
        bodyStart: html.slice(0, 300)
      });
    } catch (e) {
      console.error(`Failed to fetch ${path}:`, e);
    }
  }
  return null;
}

async function ensureCsrfToken(force = false) {
  if (csrfToken && !force) return csrfToken;
  csrfToken = null;

  // Основной способ: токен из <meta name="_csrf"> страницы сайта
  // (токен привязан к сессии, куки браузер отправит сам через credentials: 'include')
  let token = await fetchCsrfTokenFromPage();
  if (token) { csrfToken = token; return token; }

  // Запасной способ: токен в куке (на случай если сервер когда-нибудь станет ставить её)
  token = await getCsrfTokenFromCookies();
  if (token) { csrfToken = token; return token; }

  // Диагностика: какие куки вообще видит расширение для этого домена
  try {
    const cookies = await chrome.cookies.getAll({ url: API_BASE });
    console.warn('CSRF token not found anywhere. Cookies visible for', API_BASE, ':',
      cookies.map(c => c.name));
  } catch (e) {
    console.warn('CSRF token not found anywhere, and cookies are not accessible:', e.message);
  }
  return null;
}

async function fetchNowPlaying() {
  clearTimeout(nextFetchTimeout);

  try {
    const resp = await fetch(`${API_BASE}/api/playing`, {
      headers: {
        'accept': '*/*',
        'x-requested-with': 'XMLHttpRequest'
      },
      credentials: 'include'
    });

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    // Подхватываем токен из заголовков ответа если сервер его там присылает
    const token = extractCsrfFromHeaders(resp);
    if (token) csrfToken = token;

    const data = await resp.json();
    const song = data.song;
    const startTimeStr = data.startTime;

    const newSongStart = new Date(startTimeStr).getTime();
    const newSongEnd = newSongStart + (song.duration * 1000);

    // Если юзер включил радио позже чем закончилась эта песня —
    // API ещё не успело обновиться, подождём секунду и спросим снова
    if (lastPlayTime && lastPlayTime > newSongEnd) {
      nextFetchTimeout = setTimeout(fetchNowPlaying, 1000);
      return;
    }

    currentSong = song;
    // Прибавляем задержку: таймлайн отсчитывается от момента когда звук дойдёт до ушей,
    // а не от момента начала в эфире. Так elapsed=0 совпадает с реальным звуком.
    songStartTime = newSongStart + (streamDelay * 1000);

    renderSong(song);

    const elapsed = (Date.now() - songStartTime) / 1000;
    const remaining = (song.duration || 240) - elapsed;
    const delay = Math.max(remaining + 2, 5) * 1000;
    nextFetchTimeout = setTimeout(fetchNowPlaying, delay);

  } catch (e) {
    document.getElementById('trackArtist').textContent = t('unknown');
    document.getElementById('trackTitle').textContent = '';
    nextFetchTimeout = setTimeout(fetchNowPlaying, 15000);
  }
}

async function sendLike(songId) {
  // Если уже лайкнуто — повторный запрос не делаем
  if (likedSongs[songId]) return;

  const likeBtn = document.getElementById('likeBtn');
  likeBtn.disabled = true;

  try {
    // Получаем актуальный CSRF-токен (с главной страницы сайта)
    await ensureCsrfToken();

    const doLike = () => {
      const headers = {
        'accept': '*/*',
        'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'x-requested-with': 'XMLHttpRequest'
      };
      if (csrfToken) {
        headers[csrfHeaderName] = csrfToken;
      }
      return fetch(`${API_BASE}/api/like`, {
        method: 'POST',
        headers,
        body: 'id=' + songId,
        credentials: 'include',
        redirect: 'manual'  // Не даём fetch превращать POST в GET при редиректе
      });
    };

    let resp = await doLike();

    // Сервер ответил редиректом на POST: часто он ставит куку и просит повторить запрос
    if (resp.type === 'opaqueredirect') {
      console.warn('Like POST was redirected by server, retrying once');
      resp = await doLike();
      if (resp.type === 'opaqueredirect') {
        throw new Error('Server keeps redirecting POST /api/like (check Network tab: status and Location header)');
      }
    }

    // Если сервер ответил 403 — токен/сессия устарели: берём свежий токен и пробуем ещё раз
    if (resp.status === 403) {
      console.warn('Like got HTTP 403, refreshing CSRF token and retrying');
      await ensureCsrfToken(true);
      resp = await doLike();
    }

    // Сервер может прислать обновлённый токен и в ответе на лайк
    const newToken = extractCsrfFromHeaders(resp);
    if (newToken) csrfToken = newToken;

    if (!resp.ok) {
      // Диагностика: на какой адрес реально ушёл запрос (редирект превращает POST в GET и даёт 405)
      console.error('Like request failed: ' + JSON.stringify({
        status: resp.status,
        type: resp.type,
        url: resp.url,
        redirected: resp.redirected
      }));
      throw new Error('HTTP ' + resp.status);
    }

    // Сохраняем полные данные песни, а не только айди
    likedSongs[songId] = {
      id: songId,
      artist: currentSong?.artist || '',
      title: currentSong?.title || '',
      likedAt: new Date().toISOString()
    };
    chrome.storage.local.set({ likedSongs });

    likeBtn.textContent = t('liked');
    likeBtn.classList.add('liked');

  } catch (e) {
    console.error('Like failed:', e);
  } finally {
    likeBtn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggleButton');
  const volumeSlider = document.getElementById('volumeSlider');
  const likeBtn = document.getElementById('likeBtn');

  const version = chrome.runtime.getManifest().version;
  document.querySelector('.version').textContent = `Version ${version}`;

  chrome.runtime.sendMessage({action: "getState"}, function(response) {
    setStatus(response.status);
    lastPlayTime = response.lastPlayTime || null;
  });

  toggleButton.addEventListener('click', function() {
    chrome.runtime.sendMessage({action: "toggleAudio"}, function(response) {
      if (response.status !== 'busy') setStatus(response.status);
    });
  });

  volumeSlider.addEventListener('input', function() {
    const volume = parseInt(this.value);
    currentVolume = volume;
    document.getElementById('volumeValue').textContent = volume + '%';
    chrome.runtime.sendMessage({ action: "setVolume", volume: volume / 100 });
    chrome.storage.sync.set({volume: volume});
  });

  document.getElementById('openSettings').addEventListener('click', function() {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('openLiked').addEventListener('click', function() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/liked/liked.html') });
  });

  likeBtn.addEventListener('click', function() {
    const songId = parseInt(this.dataset.songId);
    if (songId) sendLike(songId);
  });

  fetchNowPlaying();

  progressInterval = setInterval(updateProgressBar, 1000);

  // Обновляем кнопку при любых изменениях состояния потока:
  // хоткей, потеря связи, переподключение, успешное восстановление
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'streamStatus') {
      setStatus(message.status);
    }
  });
});

window.addEventListener('unload', () => {
  clearTimeout(nextFetchTimeout);
  clearInterval(progressInterval);
});
