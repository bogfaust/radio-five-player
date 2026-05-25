// Translations for settings page
const translations = {
	ru: {
		pageTitle: "Настройки",
		pageSubtitle: "Настройте поведение расширения",
		langHeader: "Язык",
		langDescription: "Выберите предпочитаемый язык",
		autoplayHeader: "Автовоспроизведение",
		autoplayDescription: "Автоматически включать радио при запуске браузера",
		startupVolume: "Громкость при запуске",
		savedText: "Настройки сохранены!",
		hotkeyLabel: "Горячая клавиша",
		noHotkey: "не назначена",
		advancedHeader: "⚙️ Дополнительно",
		advancedWarning: "⚠️ Менять только при необходимости. Неверный адрес — радио перестанет работать.",
		streamUrlHeader: "Адрес потока",
		streamUrlDescription: "URL аудиопотока радиостанции",
		streamDelayHeader: "Задержка потока",
		streamDelayDescription: "Компенсация буферной задержки стрима. Название трека появится на это время позже смены песни в эфире.",
		streamDelaySeconds: "сек",
	},
	en: {
		pageTitle: "Settings",
		pageSubtitle: "Configure extension behavior",
		langHeader: "Language",
		langDescription: "Choose your preferred language",
		autoplayHeader: "Autoplay",
		autoplayDescription: "Automatically start radio when browser launches",
		startupVolume: "Startup volume",
		savedText: "Settings saved!",
		hotkeyLabel: "Hotkey",
		noHotkey: "not set",
		advancedHeader: "⚙️ Advanced",
		advancedWarning: "⚠️ Change only if necessary. A wrong URL will break playback.",
		streamUrlHeader: "Stream URL",
		streamUrlDescription: "Audio stream URL of the radio station",
		streamDelayHeader: "Stream delay",
		streamDelayDescription: "Compensates for stream buffer delay. Track name will appear this many seconds after the song actually changes on air.",
		streamDelaySeconds: "sec",
	}
};

import { STREAM_URL as DEFAULT_STREAM_URL, STREAM_DELAY as DEFAULT_STREAM_DELAY, resolveStreamUrl } from '../config.js';

let currentLanguage = 'ru';
let autoplayEnabled = false;
let startupVolume = 100;
let currentHotkey = '';
let currentStreamUrl = DEFAULT_STREAM_URL;
let streamDelay = DEFAULT_STREAM_DELAY;

// Load settings from storage
function loadSettings() {
	chrome.storage.sync.get(['language', 'autoplay', 'startupVolume', 'streamUrl', 'streamDelay'], function(result) {
		currentLanguage = result.language || 'ru';
		autoplayEnabled = result.autoplay || false;
		startupVolume = result.startupVolume !== undefined ? result.startupVolume : 100;
		currentStreamUrl = resolveStreamUrl(result.streamUrl);
		if (!result.streamUrl || resolveStreamUrl(result.streamUrl) !== result.streamUrl) {
			chrome.storage.sync.set({ streamUrl: DEFAULT_STREAM_URL });
		}
		streamDelay = result.streamDelay !== undefined ? result.streamDelay : DEFAULT_STREAM_DELAY;

		updateLanguageButtons();
		updateAutoplayToggle();
		updateStartupVolumeUI();
		updateStreamUrlUI();
		updateStreamDelayUI();
		updatePageLanguage();
		loadHotkey();
	});
}

function loadHotkey() {
	chrome.commands.getAll((commands) => {
		const toggleCommand = commands.find(cmd => cmd.name === 'toggle-radio');
		if (toggleCommand && toggleCommand.shortcut) {
			currentHotkey = toggleCommand.shortcut;
		} else {
			const t = translations[currentLanguage];
			currentHotkey = t.noHotkey;
		}
		updateFooter();
	});
}

function updateFooter() {
	const version = chrome.runtime.getManifest().version;
	const footer = document.querySelector('.footer');
	const t = translations[currentLanguage];
	if (footer) {
		footer.textContent = `Version ${version} | ${t.hotkeyLabel}: ${currentHotkey}`;
	}
}

function updateLanguageButtons() {
	document.querySelectorAll('.language-btn').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.lang === currentLanguage);
	});
}

function updateAutoplayToggle() {
	document.getElementById('autoplayToggle').checked = autoplayEnabled;
}

function updateStartupVolumeUI() {
	const slider = document.getElementById('startupVolumeSlider');
	const valueDisplay = document.getElementById('startupVolumeValue');
	slider.value = startupVolume;
	valueDisplay.textContent = startupVolume + '%';
	const disabled = !autoplayEnabled;
	slider.classList.toggle('disabled', disabled);
	slider.disabled = disabled;
}

function updateStreamUrlUI() {
	const input = document.getElementById('streamUrlInput');
	input.value = currentStreamUrl;
	input.placeholder = DEFAULT_STREAM_URL;
}

function updateStreamDelayUI() {
	const input = document.getElementById('streamDelayInput');
	const unit = document.getElementById('streamDelayUnit');
	const t = translations[currentLanguage];
	input.value = streamDelay;
	unit.textContent = t.streamDelaySeconds;
}

function updatePageLanguage() {
	const t = translations[currentLanguage];

	document.getElementById('pageTitle').textContent = t.pageTitle;
	document.getElementById('pageSubtitle').textContent = t.pageSubtitle;
	document.getElementById('langHeader').textContent = t.langHeader;
	document.getElementById('langDescription').textContent = t.langDescription;
	document.getElementById('autoplayHeader').textContent = t.autoplayHeader;
	document.getElementById('autoplayDescription').textContent = t.autoplayDescription;
	document.getElementById('startupVolumeLabel').textContent = t.startupVolume;
	document.getElementById('savedText').textContent = t.savedText;
	document.getElementById('advancedWarning').textContent = t.advancedWarning;
	document.getElementById('advancedHeader').textContent = t.advancedHeader;
	document.getElementById('streamUrlHeader').textContent = t.streamUrlHeader;
	document.getElementById('streamUrlDescription').textContent = t.streamUrlDescription;
	document.getElementById('streamDelayHeader').textContent = t.streamDelayHeader;
	document.getElementById('streamDelayDescription').textContent = t.streamDelayDescription;
	document.getElementById('streamDelayUnit').textContent = t.streamDelaySeconds;

	updateFooter();
}

function saveSettings() {
	const settings = {
		language: currentLanguage,
		autoplay: autoplayEnabled,
		startupVolume: startupVolume,
		streamUrl: currentStreamUrl,
		streamDelay: streamDelay
	};
	chrome.storage.sync.set(settings, function() {
		showSaveNotification();
	});
}

function showSaveNotification() {
	const notification = document.getElementById('saveNotification');
	notification.classList.add('show');
	setTimeout(() => notification.classList.remove('show'), 2000);
}

document.querySelectorAll('.language-btn').forEach(btn => {
	btn.addEventListener('click', function() {
		currentLanguage = this.dataset.lang;
		updateLanguageButtons();
		updatePageLanguage();
		saveSettings();
	});
});

document.getElementById('autoplayToggle').addEventListener('change', function() {
	autoplayEnabled = this.checked;
	updateStartupVolumeUI();
	saveSettings();
});

document.getElementById('startupVolumeSlider').addEventListener('input', function() {
	startupVolume = parseInt(this.value);
	document.getElementById('startupVolumeValue').textContent = startupVolume + '%';
	saveSettings();
});

document.addEventListener('DOMContentLoaded', function() {
	loadSettings();

	const streamUrlInput = document.getElementById('streamUrlInput');
	let streamUrlDebounce;
	streamUrlInput.addEventListener('input', function() {
		clearTimeout(streamUrlDebounce);
		streamUrlDebounce = setTimeout(() => {
			currentStreamUrl = this.value.trim() || DEFAULT_STREAM_URL;
			saveSettings();
		}, 800);
	});
	document.getElementById('streamUrlReset').addEventListener('click', function() {
		currentStreamUrl = DEFAULT_STREAM_URL;
		streamUrlInput.value = DEFAULT_STREAM_URL;
		saveSettings();
	});

	const streamDelayInput = document.getElementById('streamDelayInput');
	let delayDebounce;
	streamDelayInput.addEventListener('input', function() {
		clearTimeout(delayDebounce);
		delayDebounce = setTimeout(() => {
			const val = parseInt(this.value);
			streamDelay = (!isNaN(val) && val >= 0 && val <= 60) ? val : DEFAULT_STREAM_DELAY;
			this.value = streamDelay;
			saveSettings();
		}, 800);
	});
	document.getElementById('streamDelayReset').addEventListener('click', function() {
		streamDelay = DEFAULT_STREAM_DELAY;
		streamDelayInput.value = DEFAULT_STREAM_DELAY;
		saveSettings();
	});
});
