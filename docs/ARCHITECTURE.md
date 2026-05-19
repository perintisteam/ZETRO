# Architecture

Zetro is a small Electron app split between the main process, a secure preload bridge, and browser-based renderer modules.

## Main Process

[main.js](../main.js) owns operating-system integration:

- creates the Electron window
- configures display capture source selection
- exposes IPC handlers for recording storage
- opens files and folders through the desktop shell
- saves recordings to `app.getPath("videos")/Zetro`

[main/playback.js](../main/playback.js) contains the `ffmpeg` helpers used to convert WebM recordings into MP4 files that are safer for Linux file managers and GStreamer-based players.

## Preload Bridge

[preload.js](../preload.js) exposes a constrained `window.zetro` API to the renderer with `contextBridge`. Renderer code does not get direct Node.js access.

## Renderer

The renderer is loaded from [index.html](../index.html) and organized into ES modules under `assets/`.

- [assets/app.js](../assets/app.js) wires UI elements, settings, navigation, and recorder callbacks.
- [assets/recorder.js](../assets/recorder.js) handles screen capture, optional audio, optional webcam capture, canvas composition, and `MediaRecorder`.
- [assets/library.js](../assets/library.js) lists saved recordings and calls IPC helpers for playback, folder reveal, deletion, and conversion.
- [assets/settings.js](../assets/settings.js) persists theme, language, and zoom settings.
- [assets/i18n.js](../assets/i18n.js) stores UI translations.
- [assets/zoom.js](../assets/zoom.js) implements smooth zoom state and drawing.

## Recording Flow

1. The renderer asks the main process for available screen/window sources.
2. The user chooses a source and Zetro opens a live preview.
3. Recording starts from either the direct screen stream or a canvas-composited stream when zoom/webcam overlay is active.
4. `MediaRecorder` collects WebM chunks.
5. The renderer sends the finished recording buffer to the main process.
6. The main process writes the file and converts it to MP4 when `ffmpeg` is available.
7. The library view refreshes from the local recordings folder.

## Security Notes

- `nodeIntegration` is disabled.
- `contextIsolation` is enabled.
- The renderer uses only the IPC methods exposed in `preload.js`.
- Local recordings are written only to the user's Zetro videos folder.
