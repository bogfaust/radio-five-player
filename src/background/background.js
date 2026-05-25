import { STREAM_URL, resolveStreamUrl } from '../config.js';

let isToggling = false;


async function setupOffscreenDocument(path) {
  if (await chrome.offscreen.hasDocument()) return false; // already exists
  await chrome.offscreen.createDocument({
    url: path,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing audio for radio extension',
  });
  return true; // newly created
}

async function toggleRadio() {
  if (isToggling) return;
  isToggling = true;

  try {
    await setupOffscreenDocument('src/offscreen/offscreen.html');

    const stateResponse = await chrome.runtime.sendMessage({action: 'getState'});
    const currentlyPlaying = stateResponse.isPlaying;

    if (!currentlyPlaying) {
      // Звук включения
      chrome.runtime.sendMessage({action: 'playFeedback'});

      const result = await chrome.storage.sync.get(['volume', 'streamUrl']);
      const volume = result.volume !== undefined ? result.volume : 100;
      await chrome.runtime.sendMessage({
        action: 'setVolume',
        volume: volume / 100
      });

      const response = await chrome.runtime.sendMessage({
        action: 'play',
        streamUrl: resolveStreamUrl(result.streamUrl)
      });
      const isPlaying = response.status === 'playing';
      if (isPlaying) {
        chrome.storage.local.set({ lastPlayTime: Date.now() });
      }
      chrome.action.setBadgeText({text: isPlaying ? "ON" : ""});
      chrome.runtime.sendMessage({action: 'stateChanged', isPlaying}).catch(() => {});
      return isPlaying;
    }

    // Звук выключения
    chrome.runtime.sendMessage({action: 'playStopFeedback'});

    const response = await chrome.runtime.sendMessage({action: 'pause'});
    const isPlaying = response.status === 'playing';
    chrome.action.setBadgeText({text: isPlaying ? "ON" : ""});
    chrome.runtime.sendMessage({action: 'stateChanged', isPlaying}).catch(() => {});
    return isPlaying;
  } finally {
    isToggling = false;
  }
}

async function startRadio() {
  await setupOffscreenDocument('src/offscreen/offscreen.html');

  const result = await chrome.storage.sync.get(['startupVolume', 'streamUrl']);
  const startupVolume = result.startupVolume !== undefined ? result.startupVolume : 100;

  await chrome.storage.sync.set({volume: startupVolume});

  await chrome.runtime.sendMessage({
    action: 'setVolume',
    volume: startupVolume / 100
  });

  const response = await chrome.runtime.sendMessage({
    action: 'play',
    streamUrl: resolveStreamUrl(result.streamUrl)
  });
  const isPlaying = response.status === 'playing';
  if (isPlaying) {
    chrome.storage.local.set({ lastPlayTime: Date.now() });
  }
  chrome.action.setBadgeText({text: isPlaying ? "ON" : ""});

  return isPlaying;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "toggleAudio") {
    toggleRadio().then(isPlaying => {
      sendResponse({isPlaying: isPlaying});
    });
  } else if (request.action === "getState") {
    setupOffscreenDocument('src/offscreen/offscreen.html').then(() => {
      Promise.all([
        chrome.runtime.sendMessage({action: 'getState'}),
        chrome.storage.local.get(['lastPlayTime'])
      ]).then(([response, stored]) => {
        sendResponse({
          isPlaying: response.isPlaying,
          lastPlayTime: stored.lastPlayTime || null
        });
      });
    });
  } else if (request.action === "setVolume") {
    setupOffscreenDocument('src/offscreen/offscreen.html').then(() => {
      chrome.runtime.sendMessage({
        action: 'setVolume',
        volume: request.volume
      }).then(response => {
        sendResponse(response);
      });
    });
  }
  return true;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-radio") {
    toggleRadio();
  }
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(['autoplay'], function(result) {
    if (result.autoplay === true) {
      setTimeout(() => {
        startRadio();
      }, 1000);
    }
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    // При установке не запускаем автоматически
  }
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
