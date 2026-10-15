# Radio Five Player

> Chrome extension for listening to [Radio Five](https://radiofive.ru) directly in your browser.

![Chrome](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome) ![Manifest V3](https://img.shields.io/badge/Manifest-V3-green) ![Version](https://img.shields.io/badge/version-0.0.3-orange)

---

## Features

- 🎵 **One-click playback** — turn the radio on and off directly from the browser toolbar
- ⌨️ **Hotkey** — toggle playback with `Alt+P` (can be made global in Chrome settings)
- 🔊 **Volume control** — slider in the popup, saved between sessions
- ▶️ **Autoplay** — optional: radio starts automatically when the browser launches, with its own startup volume
- 🎶 **Now playing** — artist and title of the current song with a progress bar (jingles are recognised and shown as such)
- ⏱ **Stream delay compensation** — track name changes in sync with the sound you actually hear, not with the on-air moment
- 🔁 **Auto-recovery** — if the connection drops or Chrome closes the background audio page, playback is restored automatically
- 🔖 **Toolbar badge** — `ON` while playing, `...` while connecting or reconnecting
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
4. Click **Load unpacked** and select the project folder (the one that contains `manifest.json`)

After changing any file, press the reload button (circular arrow) on the extension card in `chrome://extensions/`.

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

Open the settings page from the popup (or via the extension's **Options**).

| Option | Description |
|---|---|
| Language | Russian / English |
| Autoplay | Automatically start radio when the browser launches |
| Startup volume | Volume level used for autoplay |
| Stream URL *(Advanced)* | Audio stream address. A wrong value breaks playback; the ↺ button restores the default |
| Stream delay *(Advanced)* | Compensates for the stream buffer delay (default 16 s, range 0–60 s). The track name appears this many seconds after the song actually changes on air |

---

## Permissions

| Permission | Why |
|---|---|
| `storage` | Save volume, language, autoplay settings and liked songs |
| `offscreen` | Play the audio stream in the background |
| `alarms` | Periodic watchdog that restores playback if the background audio page was closed |
| `cookies` | Fallback way to find the CSRF token when sending likes (see [How likes work](#how-likes-work)) |
| `tabs` | Open the liked songs page |
| `https://radiofive.ru/*` | Site API: now playing, like endpoint, CSRF token |
| `https://radiofive.org/*` | Audio stream source |

---

## How likes work

The site protects `POST /api/like` with a CSRF token (Spring Security). The extension:

1. Loads the site page (`/head`, then `/`) and reads the token from `<meta name="_csrf">`; the header name comes from `<meta name="_csrf_header">` (default `X-CSRF-TOKEN`).
2. Sends `POST /api/like` with the token and the session cookie (the browser attaches the cookie automatically).
3. If the server answers `403`, fetches a fresh token and retries once.

Notes:

- **The token is treated as an opaque string.** Since Spring Security 6 the token in the page is masked (random per request, ~96 characters base64url instead of a plain UUID). The server unmasks it itself, so the extension must not validate its format — just send it back as is.
- **The API lives on `radiofive.ru`.** `radiofive.org` is used for the audio stream only and answers other paths with `301` to `radiofive.ru`. A `fetch` follows a 301 by repeating the request as `GET`, which turns a like into `405 Method Not Allowed`. Keep `API_BASE` on `.ru`.

---

## Configuration (for developers)

All addresses are defined in one place — `src/config.js`:

| Constant | Default | Purpose |
|---|---|---|
| `API_BASE` | `https://radiofive.ru` | Now playing, likes, CSRF token |
| `STREAM_URL` | `https://radiofive.org/radio.mp3` | Audio stream |
| `STREAM_DELAY` | `16` | Default stream delay, seconds |

If you change a domain, also update `host_permissions` in `manifest.json`.

---

## Troubleshooting

Open DevTools for the popup (right-click the popup → **Inspect**) and check the **Console** and **Network** tabs.

| Symptom | Likely cause |
|---|---|
| `CSRF token not found anywhere` | The page did not contain `<meta name="_csrf">`, or `API_BASE` points to the wrong domain. The console prints the status, final URL and the start of the response body |
| `HTTP 403` on like | Token or session is stale (the extension already retries once), or the server rejects the request headers |
| `HTTP 405` on like | The request was redirected and re-sent as `GET` — check that `API_BASE` is `https://radiofive.ru` |
| `Server keeps redirecting POST /api/like` | The server redirects the like request itself; look at the status and `Location` header of the `POST` in the Network tab |
| Now playing shows "Unknown" | `GET /api/playing` failed; check `API_BASE` and network access |

---

## Changelog

### Unreleased
- 🐛 Fix likes after the server update to Spring Security 6: the CSRF token is no longer required to be a UUID, it is read from the page `<meta name="_csrf">` and sent in the header named by `_csrf_header`
- 🐛 API requests (now playing, likes, CSRF token) go to `radiofive.ru`; `radiofive.org` is used for the stream only, which avoids a `301` redirect turning `POST` into `GET` (`405`)
- Retry a like once with a fresh token on `403`
- `fetch` for likes no longer follows redirects automatically; a redirect is reported with a clear error
- Detailed diagnostics in the popup console when a token is not found or a like fails

### 0.0.3
- Now playing with progress bar and jingle detection
- Advanced settings: stream URL and stream delay
- Background watchdog and automatic reconnection; toolbar badge with playback status

### 0.0.2
- ♥ Like button — send a like to the Radio Five site while a song is playing
- 📋 Liked songs list with artist, title, and timestamp
- Live list updates when a song is liked from the popup

### 0.0.1
- Initial release
- One-click playback, hotkey (`Alt+P`), volume control
- Autoplay on browser startup
- Russian / English interface