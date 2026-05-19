const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { makePlaybackSafe, hasFfmpeg } = require("./main/playback.js");
const {
  app,
  BrowserWindow,
  session,
  desktopCapturer,
  ipcMain,
  nativeImage,
  shell,
} = require("electron");

const iconPath = path.join(__dirname, "assets", "zetro-logo.png");

function getRecordingsDir() {
  const dir = path.join(app.getPath("videos"), "Zetro");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function listRecordingFiles() {
  const dir = getRecordingsDir();
  return fs
    .readdirSync(dir)
    .filter((f) => [".webm", ".mp4"].includes(path.extname(f).toLowerCase()))
    .map((name) => {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      return {
        id: name,
        name,
        filePath,
        fileUrl: pathToFileURL(filePath).href,
        size: stat.size,
        createdAt: stat.mtimeMs,
      };
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 960,
    height: 780,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#ffffff",
    title: "Zetro",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (process.platform === "linux") {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) win.setIcon(icon);
  }

  win.loadFile("index.html");
}

function setupDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer
      .getSources({
        types: ["screen", "window"],
        thumbnailSize: { width: 1920, height: 1080 },
      })
      .then((sources) => {
        if (sources.length === 0) {
          callback();
          return;
        }
        const screen =
          sources.find((s) => s.name === "Entire Screen" || s.id.startsWith("screen:")) ??
          sources[0];
        callback({ video: screen, audio: "loopback" });
      })
      .catch(() => callback());
  });
}

ipcMain.handle("zetro:get-sources", async () => {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 480, height: 270 },
    fetchWindowIcons: true,
  });

  return sources.map((s) => ({
    id: s.id,
    name: s.name,
    thumbnail: s.thumbnail.toDataURL(),
    appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
  }));
});

ipcMain.handle("zetro:save-recording", async (_, arrayBuffer, suggestedName) => {
  const dir = getRecordingsDir();
  const safeName = suggestedName?.replace(/[^\w.-]/g, "_") || `zetro-${Date.now()}.webm`;
  let filePath = path.join(dir, safeName.endsWith(".webm") ? safeName : `${safeName}.webm`);
  fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

  let playbackFixed = false;
  let playbackWarning = null;

  if (await hasFfmpeg()) {
    try {
      filePath = await makePlaybackSafe(filePath);
      playbackFixed = true;
    } catch (err) {
      playbackWarning = err.message;
    }
  } else {
    playbackWarning = "ffmpeg-not-found";
  }

  const stat = fs.statSync(filePath);
  return {
    id: path.basename(filePath),
    name: path.basename(filePath),
    filePath,
    fileUrl: pathToFileURL(filePath).href,
    size: stat.size,
    createdAt: stat.mtimeMs,
    playbackFixed,
    playbackWarning,
  };
});

ipcMain.handle("zetro:reencode-recording", async (_, id) => {
  const filePath = path.join(getRecordingsDir(), id);
  if (!fs.existsSync(filePath)) throw new Error("File not found");
  if (!(await hasFfmpeg())) throw new Error("ffmpeg-not-found");
  const fixedPath = await makePlaybackSafe(filePath);
  const stat = fs.statSync(fixedPath);
  return {
    id: path.basename(fixedPath),
    fileUrl: pathToFileURL(fixedPath).href,
    size: stat.size,
    playbackFixed: true,
  };
});

ipcMain.handle("zetro:has-ffmpeg", async () => hasFfmpeg());

ipcMain.handle("zetro:list-recordings", async () => listRecordingFiles());

ipcMain.handle("zetro:delete-recording", async (_, id) => {
  const filePath = path.join(getRecordingsDir(), id);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  return true;
});

ipcMain.handle("zetro:open-recording", async (_, id) => {
  const filePath = path.join(getRecordingsDir(), id);
  if (!fs.existsSync(filePath)) throw new Error("File not found");
  await shell.openPath(filePath);
  return true;
});

ipcMain.handle("zetro:show-in-folder", async (_, id) => {
  const filePath = path.join(getRecordingsDir(), id);
  if (!fs.existsSync(filePath)) throw new Error("File not found");
  shell.showItemInFolder(filePath);
  return true;
});

ipcMain.handle("zetro:get-recordings-dir", async () => getRecordingsDir());

ipcMain.handle("zetro:open-recordings-folder", async () => {
  await shell.openPath(getRecordingsDir());
  return true;
});

app.whenReady().then(() => {
  setupDisplayMediaHandler();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
