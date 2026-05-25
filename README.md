# Radio Five Player

> Chrome extension for listening to [Radio Five](https://radiofive.ru) directly in your browser.

![Chrome](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-green) ![Version](https://img.shields.io/badge/version-0.0.2-orange)

---

## Features

- 🎵 **One-click playback** — turn the radio on and off directly from the browser toolbar
- ⌨️ **Hotkey** — toggle playback with `Alt+P` (can be made global in Chrome settings)
- 🔊 **Volume control** — slider in the popup, saved between sessions
- ▶️ **Autoplay** — optional: radio starts automatically when the browser launches
- ♥ **Like songs** — send a like to the Radio Five site while a song is playing
- 📋 **Liked songs list** — save and browse your liked tracks with timestamps
- 🌐 **Two languages** — Russian and English interface
- 🚫 **No ads, no unnecessary permissions**

---

## Installation

### From Chrome Web Store

Search for **Radio Five Player** in the [Chrome Web Store](https://chrome.google.com/webstore).

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
| `offscreen` | Play audio stream in the background |
| `cookies` | Obtain CSRF token to send likes to the Radio Five site |
| `tabs` | Open the liked songs page |
| `https://radiofive.ru/*` | Now playing API and like endpoint |
| `https://radiofive.org/*` | Audio stream source |

---

## Changelog

### 0.0.2
- ♥ Like button — send a like to the Radio Five site while a song is playing
- 📋 Liked songs list with artist, title, and timestamp
- Live list updates when a song is liked from the popup

### 0.0.1
- Initial release
- One-click playback, hotkey (`Alt+P`), volume control
- Autoplay on browser startup
- Russian / English interface

