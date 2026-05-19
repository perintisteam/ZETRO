function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDate(ms, locale) {
  return new Date(ms).toLocaleString(locale === "id" ? "id-ID" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function createLibrary({ els, tr, onStatus }) {
  async function refresh() {
    if (!window.zetro?.listRecordings) {
      els.recordingsList.innerHTML = `<p class="p-6 text-center text-sm text-gpt-muted">${tr("libraryUnavailable")}</p>`;
      return;
    }

    els.recordingsList.innerHTML = `<p class="p-6 text-center text-sm text-gpt-muted">${tr("loadingRecordings")}</p>`;

    try {
      const items = await window.zetro.listRecordings();

      if (items.length === 0) {
        els.recordingsList.innerHTML = `<p class="p-8 text-center text-sm text-gpt-muted">${tr("noRecordings")}</p>`;
        return;
      }

      els.recordingsList.innerHTML = items
        .map(
          (item) => `
        <article class="recording-item gpt-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center" data-id="${item.id}">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <p class="truncate text-sm font-medium">${item.name}</p>
            <p class="text-xs text-gpt-muted">${formatDate(item.createdAt, document.documentElement.lang)} · ${formatSize(item.size)}</p>
          </div>
          <div class="flex shrink-0 flex-wrap gap-2">
            <button type="button" class="gpt-btn-soft !rounded-xl !px-3 !py-2 text-xs play-btn" data-id="${item.id}" data-url="${item.fileUrl}">${tr("play")}</button>
            <button type="button" class="gpt-btn-soft !rounded-xl !px-3 !py-2 text-xs open-btn" data-id="${item.id}">${tr("openExternal")}</button>
            <button type="button" class="gpt-btn-soft !rounded-xl !px-3 !py-2 text-xs folder-btn" data-id="${item.id}">${tr("showFolder")}</button>
            <button type="button" class="fix-playback-btn gpt-btn-soft !rounded-xl !px-3 !py-2 text-xs" data-id="${item.id}">${tr("fixPlayback")}</button>
            <button type="button" class="recording-delete !rounded-xl !px-3 !py-2 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30" data-id="${item.id}">${tr("delete")}</button>
          </div>
        </article>`
        )
        .join("");

      els.recordingsList.querySelectorAll(".play-btn").forEach((btn) => {
        btn.addEventListener("click", () => openPlayer(btn.dataset.url, btn.dataset.id));
      });
      els.recordingsList.querySelectorAll(".open-btn").forEach((btn) => {
        btn.addEventListener("click", () => window.zetro.openRecording(btn.dataset.id));
      });
      els.recordingsList.querySelectorAll(".folder-btn").forEach((btn) => {
        btn.addEventListener("click", () => window.zetro.showInFolder(btn.dataset.id));
      });
      els.recordingsList.querySelectorAll(".fix-playback-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          btn.textContent = tr("fixingPlayback");
          try {
            if (!(await window.zetro.hasFfmpeg())) {
              onStatus?.("ffmpegHint", true);
              return;
            }
            await window.zetro.reencodeRecording(btn.dataset.id);
            await refresh();
            onStatus?.("savedToLibrary");
          } catch (err) {
            onStatus?.(err.message === "ffmpeg-not-found" ? "ffmpegHint" : err.message, true);
          } finally {
            btn.disabled = false;
          }
        });
      });
      els.recordingsList.querySelectorAll(".recording-delete").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm(tr("deleteConfirm"))) return;
          await window.zetro.deleteRecording(btn.dataset.id);
          await refresh();
          onStatus?.("deleted");
        });
      });
    } catch (err) {
      els.recordingsList.innerHTML = `<p class="p-6 text-center text-sm text-red-500">${err.message}</p>`;
    }
  }

  function openPlayer(fileUrl, id) {
    els.playerVideo.src = fileUrl;
    els.playerVideo.load();
    els.playerTitle.textContent = id;
    els.playerModal.classList.remove("hidden");
    els.playerModal.classList.add("flex");
    els.playerVideo.play().catch(() => {});
  }

  function closePlayer() {
    els.playerVideo.pause();
    els.playerVideo.removeAttribute("src");
    els.playerVideo.load();
    els.playerModal.classList.add("hidden");
    els.playerModal.classList.remove("flex");
  }

  els.playerCloseBtn?.addEventListener("click", closePlayer);
  els.playerModal?.addEventListener("click", (e) => {
    if (e.target === els.playerModal) closePlayer();
  });

  els.openRecordingsFolderBtn?.addEventListener("click", () => {
    window.zetro.openRecordingsFolder();
  });

  return { refresh, closePlayer };
}
