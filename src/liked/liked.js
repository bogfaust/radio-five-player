const i18n = {
  ru: {
    pageTitle:    "Понравившиеся — Radio Five",
    heading:      "Понравившиеся",
    loading:      "Загрузка...",
    clearTitle:   "Очистить список",
    nothingLiked: "Ничего не лайкнуто",
    songOne:      "песня",
    songFew:      "песни",
    songMany:     "песен",
    emptyText:    "Вы ещё не лайкали песни.\nОткройте плеер и нажмите ♥ во время воспроизведения.",
    confirmText:  "Очистить весь список лайков?",
    cancel:       "Отмена",
    confirm:      "Очистить",
    yesterday:    "вчера",
    unknown:      "—",
  },
  en: {
    pageTitle:    "Liked Songs — Radio Five",
    heading:      "Liked Songs",
    loading:      "Loading...",
    clearTitle:   "Clear list",
    nothingLiked: "Nothing liked yet",
    songOne:      "song",
    songFew:      "songs",
    songMany:     "songs",
    emptyText:    "You haven't liked any songs yet.\nOpen the player and press ♥ while a song is playing.",
    confirmText:  "Clear the entire liked list?",
    cancel:       "Cancel",
    confirm:      "Clear",
    yesterday:    "yesterday",
    unknown:      "—",
  }
};

let lang = 'ru';
let likedSongs = {};

function t(key) {
  return (i18n[lang] || i18n.ru)[key] || key;
}

function applyLanguage() {
  document.title = t('pageTitle');
  document.querySelector('h1').textContent = t('heading');
  document.getElementById('clearBtn').title = t('clearTitle');
}

function plural(n, one, few, many) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const now = new Date();

  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return t('yesterday');
  }

  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' });
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderList() {
  const listEl    = document.getElementById('list');
  const emptyEl   = document.getElementById('empty');
  const subtitleEl = document.getElementById('subtitle');
  const emptyTextEl = document.getElementById('emptyText');

  const songs = Object.values(likedSongs)
    .sort((a, b) => new Date(b.likedAt || 0) - new Date(a.likedAt || 0));

  const total = songs.length;

  subtitleEl.textContent = total === 0
    ? t('nothingLiked')
    : `${total} ${plural(total, t('songOne'), t('songFew'), t('songMany'))}`;

  emptyTextEl.innerHTML = t('emptyText').replace('\n', '<br>');

  if (total === 0) {
    listEl.classList.add('hidden');
    emptyEl.classList.remove('hidden');
    return;
  }

  listEl.classList.remove('hidden');
  emptyEl.classList.add('hidden');

  listEl.innerHTML = songs.map((song, i) => `
    <div class="song-item">
      <span class="song-num">${i + 1}</span>
      <div class="song-info">
        <div class="song-artist">${esc(song.artist || t('unknown'))}</div>
        ${song.title ? `<div class="song-title">${esc(song.title)}</div>` : ''}
        ${(!song.artist && !song.title) ? `<div class="song-title">ID: ${song.id}</div>` : ''}
      </div>
      <span class="song-date">${formatDate(song.likedAt)}</span>
      <span class="song-heart">♥</span>
    </div>
  `).join('');
}

let confirmBar = null;

// Живые обновления если попап лайкнул что-то пока страница открыта
chrome.storage.onChanged.addListener(function(changes) {
  if (changes.likedSongs) {
    const val = changes.likedSongs.newValue;
    likedSongs = Array.isArray(val)
      ? Object.fromEntries(val.map(id => [id, { id }]))
      : (val || {});
    renderList();
  }
});

// Всё что трогает DOM — только после загрузки страницы
document.addEventListener('DOMContentLoaded', function() {

  document.getElementById('clearBtn').addEventListener('click', function() {
    if (Object.keys(likedSongs).length === 0) return;
    if (confirmBar) return;

    confirmBar = document.createElement('div');
    confirmBar.className = 'confirm-bar';
    confirmBar.innerHTML = `
      <span>${t('confirmText')}</span>
      <div class="confirm-btns">
        <button class="btn-cancel" id="cancelClear">${t('cancel')}</button>
        <button class="btn-confirm" id="confirmClear">${t('confirm')}</button>
      </div>
    `;
    document.body.appendChild(confirmBar);

    document.getElementById('cancelClear').addEventListener('click', () => {
      confirmBar.remove(); confirmBar = null;
    });
    document.getElementById('confirmClear').addEventListener('click', () => {
      likedSongs = {};
      chrome.storage.local.set({ likedSongs });
      renderList();
      confirmBar.remove(); confirmBar = null;
    });
  });

  chrome.storage.sync.get(['language'], function(result) {
    lang = result.language || 'ru';
    applyLanguage();

    chrome.storage.local.get(['likedSongs'], function(r) {
      const val = r.likedSongs;
      if (val) {
        likedSongs = Array.isArray(val)
          ? Object.fromEntries(val.map(id => [id, { id }]))
          : val;
      }
      renderList();
    });
  });

});
