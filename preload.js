const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("zetro", {
  getSources: () => ipcRenderer.invoke("zetro:get-sources"),
  saveRecording: (buffer, name) => ipcRenderer.invoke("zetro:save-recording", buffer, name),
  listRecordings: () => ipcRenderer.invoke("zetro:list-recordings"),
  deleteRecording: (id) => ipcRenderer.invoke("zetro:delete-recording", id),
  openRecording: (id) => ipcRenderer.invoke("zetro:open-recording", id),
  showInFolder: (id) => ipcRenderer.invoke("zetro:show-in-folder", id),
  getRecordingsDir: () => ipcRenderer.invoke("zetro:get-recordings-dir"),
  openRecordingsFolder: () => ipcRenderer.invoke("zetro:open-recordings-folder"),
  reencodeRecording: (id) => ipcRenderer.invoke("zetro:reencode-recording", id),
  hasFfmpeg: () => ipcRenderer.invoke("zetro:has-ffmpeg"),
});
