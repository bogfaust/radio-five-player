# Radio Five Player

> Chrome extension for listening to [Radio Five](https://radiofive.ru) directly in your browser — free internet radio with no ads and no hosts, only music.

![Chrome](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-green) ![Version](https://img.shields.io/badge/version-0.0.4-orange)

---

## Features

- 🆓 **Free radio** — no subscriptions, no payments
- 🚫 **No ads, no hosts** — only music on air, nothing extra
- 🎵 **One-click playback** — turn the radio on and off directly from the browser toolbar
- ⌨️ **Hotkey** — toggle playback with `Alt+P` (can be made global in Chrome settings)
- 🔊 **Volume control** — slider in the popup, saved between sessions
- ▶️ **Autoplay** — optional: radio starts automatically when the browser launches
- ♥ **Likes** — like the song that is playing right now; your like is sent to the Radio Five site
- 📋 **Liked songs list** — every song you like is saved to a separate list with artist, title and timestamp, so you can come back to it any time
- 🌐 **Two languages** — Russian and English interface
- 🔒 **No unnecessary permissions** — see [Permissions](#permissions)

---

## Likes

Heard a track you love? Hit the heart in the popup while the song is playing:

1. Click ♡ in the popup — the like is sent to the Radio Five site
2. The song is saved to your personal **Liked Songs** list (artist, title, date and time)
3. Click **♥ Liked Songs** in the popup to open the list whenever you want

The list is stored locally in your browser and updates live when you like a song from the popup.

---

## Installation

### From Chrome Web Store

1. **Open the extension page directly:**
   [Radio Five Player in Chrome Web Store](https://chromewebstore.google.com/detail/radio-five-player/nbjhakblcfejblllfepgombkechgnmoj)
2. If the link doesn't work for you, search for **Radio Five Player** in the [Chrome Web Store](https://chromewebstore.google.com/).

### Manual (Developer Mode)

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the project folder

---

## Usage

| Action | How |
|---|---|
| Play / Stop | Click the extension icon in the toolbar |
| Toggle with keyboard | `Alt+P` (default hotkey) |
| Adjust volume | Use the slider in the popup |
| Like current song | Click ♡ in the popup while a song is playing |
| View liked songs | Click **♥ Liked Songs** in the popup |

### Making the hotkey global

By default `Alt+P` only works when Chrome is in focus. To use it system-wide:

1. Go to `chrome://extensions/shortcuts`
2. Find **Radio Five Player → Toggle radio play/pause**
3. Set the scope to **Global**

---

## Settings

| Option | Description |
|---|---|
| Language | Russian / English |
| Autoplay on startup | Automatically start radio when browser launches |
| Autoplay volume | Volume level used for autoplay |

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save volume, language, autoplay settings and liked songs |
| `offscreen` | Play the audio stream in the background (an offscreen document keeps playing when the popup is closed) |
| `alarms` | Watchdog: every 30 seconds checks that playback is still alive and restores it if Chrome closed the background audio document |
| `cookies` | Obtain the CSRF token to send likes to the Radio Five site (only for `radiofive.ru`) |
| `tabs` | Open the liked songs page in a new tab |
| `https://radiofive.ru/*` | Now playing API and like endpoint |
| `https://radiofive.org/*` | Audio stream source |

---

## Changelog

### 0.0.4
- Localized Chrome Web Store name and short description (Russian / English) via `_locales`
- Store title: **Radio Five Player - Без рекламы** / **No Ads**

### 0.0.3
- Background playback watchdog (`alarms`): playback is restored automatically if Chrome closes the offscreen audio document
- Status badge on the toolbar icon (`ON` while playing, `...` while connecting)

### 0.0.2
- ♥ Like button — send a like to the Radio Five site while a song is playing
- 📋 Liked songs list with artist, title, and timestamp
- Live list updates when a song is liked from the popup

### 0.0.1
- Initial release
- One-click playback, hotkey (`Alt+P`), volume control
- Autoplay on browser startup
- Russian / English interface