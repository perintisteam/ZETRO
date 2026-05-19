# Zetro

Zetro is a desktop screen recorder built with Electron. It records the screen, optional microphone audio, and optional webcam overlay, then stores recordings in the user's `Videos/Zetro` folder.

## Features

- Screen or window source picker
- Live preview before recording
- Microphone and webcam toggles
- Webcam picture-in-picture overlay
- Smooth zoom controls during recording
- Local recordings library
- English and Indonesian UI text
- Light, dark, and system themes
- Automatic playback-safe conversion with `ffmpeg`

## Requirements

- Node.js 20 or newer
- npm
- Linux desktop environment with screen capture support
- `ffmpeg` for MP4 conversion that opens reliably from Linux file managers

Install `ffmpeg` on Fedora:

```bash
sudo dnf install ffmpeg
```

Install `ffmpeg` on Ubuntu/Debian:

```bash
sudo apt install ffmpeg
```

## Setup

Install dependencies:

```bash
npm install
```

Build the CSS:

```bash
npm run build:css
```

Run the app in development:

```bash
npm run dev
```

## Usage

1. Open Zetro.
2. Choose the microphone and camera options.
3. Select a screen or window.
4. Confirm the preview.
5. Start recording.
6. Stop recording when finished.
7. Open the Recordings tab to play, reveal, or fix saved recordings.

Recordings are saved to:

```text
~/Videos/Zetro
```

## Playback Compatibility

Electron's `MediaRecorder` produces WebM during recording. On some Linux systems, file managers and GStreamer try to decode these files as VP8 with alpha metadata and fail with errors such as:

```text
Cannot handle streams without an initial alpha buffer.
```

Zetro mitigates this by converting saved recordings to MP4 with H.264 video and AAC audio when `ffmpeg` is available. If conversion fails or `ffmpeg` is missing, use the Recordings tab and click `Fix playback` after installing `ffmpeg`.

## Project Structure

```text
.
├── assets/
│   ├── app.js          # Renderer entry point and UI orchestration
│   ├── i18n.js         # English and Indonesian strings
│   ├── library.js      # Recordings library UI
│   ├── logo.svg        # App logo
│   ├── recorder.js     # Capture, composition, and MediaRecorder logic
│   ├── settings.js     # Theme and language persistence
│   ├── styles.css      # Generated Tailwind CSS
│   └── zoom.js         # Smooth zoom behavior
├── main/
│   └── playback.js     # ffmpeg playback-safe conversion helpers
├── src/
│   └── input.css       # Tailwind source CSS
├── index.html          # App shell
├── main.js             # Electron main process and IPC handlers
├── preload.js          # Safe renderer bridge
└── package.json
```

## Scripts

- `npm run dev` builds CSS and starts Electron.
- `npm run build:css` compiles `src/input.css` into `assets/styles.css`.
- `npm run watch:css` watches Tailwind input and rebuilds CSS.

## License

Zetro is licensed under the MIT License. See [LICENSE](./LICENSE).
