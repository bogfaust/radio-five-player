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
    jingle: "Джингл"
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
    jingle: "Jingle"
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
let csrfToken = null;  // Берём из заголовков ответа сервера
let streamDelay = 16;  // Задержка потока в секундах

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

async function fetchCsrfTokenFromPage() {
  // Загружаем главную страницу и ищем токен в HTML
  // Spring Security обычно кладёт его в <meta name="_csrf"...>
  // или в JS-переменную window._csrf / window.csrfToken
  try {
    const resp = await fetch(`${API_BASE}/head`, { credentials: 'include' });
    const html = await resp.text();

    // <meta name="_csrf" content="uuid" />
    let m = html.match(/<meta[^>]+name=["']_?csrf["'][^>]+content=["']([0-9a-f-]{36})["'][^>]*>/i);
    if (m) return m[1];

    // <meta name="_csrf_header" ...> + <meta name="_csrf" content="uuid">  (порядок может быть любой)
    m = html.match(/content=["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["'][^>]*>/i);
    if (m) return m[1];

    // window._csrf = "uuid" или var _csrf = "uuid" или csrfToken = "uuid"
    m = html.match(/(?:window\._?csrf(?:Token)?|var\s+_?csrf(?:Token)?|csrfToken)\s*=\s*["']([0-9a-f-]{36})["'](?:\s|;)/i);
    if (m) return m[1];

    // Любой UUID в JS-скрипте рядом со словом csrf
    m = html.match(/csrf[^"']{0,30}["']([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})["']/i);
    if (m) return m[1];

  } catch(e) {
    console.error('Failed to fetch CSRF from page:', e);
  }
  return null;
}

async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;

  // Пробуем взять из кук (на случай если сервер всё же ставит куку)
  let token = await getCsrfTokenFromCookies();
  if (token) { csrfToken = token; return token; }

  // Парсим токен из HTML /head (лёгкий эндпоинт специально для этого)
  token = await fetchCsrfTokenFromPage();
  if (token) { csrfToken = token; return token; }

  console.warn('CSRF token not found anywhere');
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
    // Получаем актуальный CSRF-токен (из кук или загружая главную страницу)
    await ensureCsrfToken();

    const headers = {
      'accept': '*/*',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest'
    };
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    }

    const resp = await fetch(`${API_BASE}/api/like`, {
      method: 'POST',
      headers,
      body: 'id=' + songId,
      credentials: 'include'
    });

    // Сервер может прислать обновлённый токен и в ответе на лайк
    const newToken = extractCsrfFromHeaders(resp);
    if (newToken) csrfToken = newToken;

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

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
    updateButtonText(response.isPlaying);
    lastPlayTime = response.lastPlayTime || null;
  });

  toggleButton.addEventListener('click', function() {
    chrome.runtime.sendMessage({action: "toggleAudio"}, function(response) {
      updateButtonText(response.isPlaying);
    });
  });

  volumeSlider.addEventListener('input', function() {
    const volume = parseInt(this.value);
    currentVolume = volume;
    document.getElementById('volumeValue').textContent = volume + '%';
    chrome.runtime.sendMessage({ action: "setVolume", volume: volume / 100 });
    chrome.storage.sync.set({volume: volume});
  });

  function updateButtonText(isPlaying) {
    toggleButton.textContent = isPlaying ? t('stop') : t('play');
  }

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

  // Обновляем кнопку если состояние изменилось снаружи (хоткей, другой попап)
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'stateChanged') {
      updateButtonText(message.isPlaying);
    }
  });
});

window.addEventListener('unload', () => {
  clearTimeout(nextFetchTimeout);
  clearInterval(progressInterval);
});
