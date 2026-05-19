import { ZetroRecorder } from "./recorder.js";
import { SmoothZoom } from "./zoom.js";
import { t } from "./i18n.js";
import { loadSettings, saveSettings, applyTheme, watchSystemTheme } from "./settings.js";
import { createLibrary } from "./library.js";

const $ = (id) => document.getElementById(id);

let settings = loadSettings();
let lang = settings.language;
const zoom = new SmoothZoom(settings.zoomSmoothness);

const els = {
  recordView: $("recordView"),
  libraryView: $("libraryView"),
  settingsView: $("settingsView"),
  recordingsList: $("recordingsList"),
  openRecordingsFolderBtn: $("openRecordingsFolderBtn"),
  playerModal: $("playerModal"),
  playerVideo: $("playerVideo"),
  playerTitle: $("playerTitle"),
  playerCloseBtn: $("playerCloseBtn"),
  status: $("status"),
  timer: $("timer"),
  screenPreview: $("screenPreview"),
  previewViewport: $("previewViewport"),
  previewWrap: $("previewWrap"),
  camPreview: $("camPreview"),
  composite: $("composite"),
  idleOverlay: $("idleOverlay"),
  recBadge: $("recBadge"),
  previewBadge: $("previewBadge"),
  zoomBar: $("zoomBar"),
  selectScreenBtn: $("selectScreenBtn"),
  confirmRecordBtn: $("confirmRecordBtn"),
  cancelPreviewBtn: $("cancelPreviewBtn"),
  recordHoldBtn: $("recordHoldBtn"),
  stopBtn: $("stopBtn"),
  micToggle: $("micToggle"),
  camToggle: $("camToggle"),
  micSelect: $("micSelect"),
  camSelect: $("camSelect"),
  zoomInBtn: $("zoomInBtn"),
  zoomOutBtn: $("zoomOutBtn"),
  zoomResetBtn: $("zoomResetBtn"),
  settingsBtn: $("settingsBtn"),
  backBtn: $("backBtn"),
  themeSelect: $("themeSelect"),
  langSelect: $("langSelect"),
  zoomSmoothSlider: $("zoomSmoothSlider"),
  sourceModal: $("sourceModal"),
  sourceList: $("sourceList"),
  sourceLoading: $("sourceLoading"),
  sourceCancelBtn: $("sourceCancelBtn"),
};

const recorder = new ZetroRecorder({
  screenPreview: els.screenPreview,
  previewViewport: els.previewViewport,
  camPreview: els.camPreview,
  compositeCanvas: els.composite,
  zoom,
  onPhaseChange: handlePhase,
  onPreviewSignal: handlePreviewSignal,
  onTimer: (time) => {
    els.timer.textContent = time;
  },
  onSaved: async (result) => {
    if (!result.ok) {
      if (result.reason) setStatus(result.reason, true);
      return;
    }
    try {
      if (window.zetro?.saveRecording) {
        const buffer = await result.blob.arrayBuffer();
        const saved = await window.zetro.saveRecording(buffer, result.filename);
        await library.refresh();
        if (saved.playbackFixed) {
          setStatus(`${tr("savedToLibrary")} · ${result.sizeMb} MB`, false, true);
        } else if (saved.playbackWarning === "ffmpeg-not-found") {
          setStatus(`${tr("savedToLibrary")} · ${result.sizeMb} MB — ${tr("ffmpegHint")}`, false, true);
        } else {
          setStatus(`${tr("savedToLibrary")} · ${result.sizeMb} MB — ${tr("encodeWarn")}`, false, true);
        }
      } else {
        const url = URL.createObjectURL(result.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.filename;
        a.click();
        URL.revokeObjectURL(url);
        setStatus(`${tr("saved")} · ${result.sizeMb} MB`, false, true);
      }
    } catch (err) {
      setStatus(err.message, true, true);
      console.error(err);
    }
  },
  onScreenShareEnded: (mode) => {
    if (mode === "recording") setStatus("savingOsStop");
    else if (mode === "preview") setStatus("previewStopped");
  },
});

function tr(key) {
  return t(key, lang);
}

function applyI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (key) el.textContent = tr(key);
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.title = tr(el.dataset.i18nTitle);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", tr(el.dataset.i18nAria));
  });
  els.micToggle.textContent = tr("mic");
  els.camToggle.textContent = tr("cam");
}

function setStatus(keyOrMsg, isError = false, isRaw = false) {
  const msg = isRaw ? keyOrMsg : tr(keyOrMsg);
  els.status.textContent = msg;
  els.status.className = isError
    ? "text-center text-sm text-red-500"
    : "text-center text-sm text-gpt-muted";
}

function setToggle(btn, on) {
  btn.dataset.on = on ? "1" : "0";
  btn.classList.toggle("gpt-toggle-on", on);
  btn.classList.toggle("gpt-toggle-off", !on);
  btn.classList.toggle("border", !on);
}

async function applyMicFromUI() {
  const enabled = els.micToggle.dataset.on === "1";
  try {
    await recorder.applyMic({
      enabled,
      micId: els.micSelect.value || undefined,
    });
  } catch (err) {
    setToggle(els.micToggle, false);
    recorder.micEnabled = false;
    setStatus(err.message || tr("noMic"), true, !!err.message);
    console.error(err);
  }
}

async function applyCamFromUI() {
  const enabled = els.camToggle.dataset.on === "1";
  try {
    await recorder.applyCam({
      enabled,
      camId: els.camSelect.value || undefined,
    });
  } catch (err) {
    setToggle(els.camToggle, false);
    recorder.camEnabled = false;
    setStatus(err.message || tr("noCam"), true, !!err.message);
    console.error(err);
  }
}

function handlePhase(phase) {
  const isIdle = phase === "idle";
  const isPreview = phase === "preview";
  const isRecording = phase === "recording";

  els.idleOverlay.classList.toggle("hidden", !isIdle);
  els.zoomBar.classList.toggle("hidden", isIdle);
  els.zoomBar.classList.toggle("flex", !isIdle);

  els.selectScreenBtn.classList.toggle("hidden", !isIdle);
  els.confirmRecordBtn.classList.toggle("hidden", !isPreview);
  els.cancelPreviewBtn.classList.toggle("hidden", !isPreview);
  els.recordHoldBtn.classList.toggle("hidden", !isRecording);
  els.recordHoldBtn.classList.toggle("flex", isRecording);
  els.stopBtn.classList.toggle("hidden", !isRecording);
  els.stopBtn.classList.toggle("flex", isRecording);
  els.stopBtn.disabled = !isRecording;

  els.recBadge.classList.toggle("hidden", !isRecording);
  els.recBadge.classList.toggle("flex", isRecording);
  els.previewBadge.classList.toggle("hidden", !isPreview);
  els.previewBadge.classList.toggle("flex", isPreview);

  els.selectScreenBtn.disabled = !isIdle;

  if (isIdle) setStatus("ready");
  if (isPreview) setStatus("previewOk");
  if (isRecording) setStatus("recording");
}

function handlePreviewSignal(ok) {
  if (recorder.phase !== "preview") return;

  const badge = els.previewBadge.querySelector("span:last-child");
  if (badge) badge.textContent = ok ? tr("previewOk") : tr("previewFail");

  els.previewBadge.classList.toggle("bg-emerald-50", ok);
  els.previewBadge.classList.toggle("ring-emerald-200", ok);
  els.previewBadge.classList.toggle("bg-amber-50", !ok);
  els.previewBadge.classList.toggle("ring-amber-200", !ok);

  els.confirmRecordBtn.disabled = !ok;
}

function getOpts() {
  return {
    micEnabled: els.micToggle.dataset.on === "1",
    camEnabled: els.camToggle.dataset.on === "1",
    micId: els.micSelect.value || undefined,
    camId: els.camSelect.value || undefined,
  };
}

async function populateDevices() {
  const prevMic = els.micSelect.value;
  const prevCam = els.camSelect.value;

  try {
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch {
    /* optional */
  }

  const { mics, cameras } = await recorder.loadDevices();

  els.micSelect.innerHTML =
    mics.length === 0
      ? `<option value="">${tr("noMic")}</option>`
      : mics
          .map((d, i) => `<option value="${d.deviceId}">${d.label || `${tr("mic")} ${i + 1}`}</option>`)
          .join("");

  els.camSelect.innerHTML =
    cameras.length === 0
      ? `<option value="">${tr("noCam")}</option>`
      : cameras
          .map((d, i) => `<option value="${d.deviceId}">${d.label || `${tr("cam")} ${i + 1}`}</option>`)
          .join("");

  if (prevMic && [...els.micSelect.options].some((o) => o.value === prevMic)) {
    els.micSelect.value = prevMic;
  }
  if (prevCam && [...els.camSelect.options].some((o) => o.value === prevCam)) {
    els.camSelect.value = prevCam;
  }
}

const library = createLibrary({
  els,
  tr,
  onStatus: (key, isError) => setStatus(key, isError),
});

function updateNavTabs(active) {
  document.querySelectorAll(".nav-tab").forEach((btn) => {
    const isRecord = btn.classList.contains("nav-to-record") || btn.id === "navRecordBtn";
    const isLibrary = btn.classList.contains("nav-to-library") || btn.id === "navLibraryBtn";
    const on =
      (active === "record" && isRecord) || (active === "library" && isLibrary);
    btn.classList.toggle("nav-tab-active", on);
    btn.classList.toggle("text-gpt-muted", !on);
  });
}

function openSettings() {
  library.closePlayer();
  els.settingsView.classList.remove("hidden");
  els.settingsView.classList.add("flex");
  els.settingsBtn.classList.add("hidden");
}

function closeSettings() {
  els.settingsView.classList.add("hidden");
  els.settingsView.classList.remove("flex");
  els.settingsBtn.classList.remove("hidden");
}

function showView(view) {
  if (view === "settings") {
    openSettings();
    return;
  }

  closeSettings();

  const isRecord = view === "record";
  const isLibrary = view === "library";

  els.recordView.classList.toggle("hidden", !isRecord);
  els.recordView.classList.toggle("flex", isRecord);
  els.libraryView.classList.toggle("hidden", !isLibrary);
  els.libraryView.classList.toggle("flex", isLibrary);

  if (isLibrary) {
    library.refresh();
    updateNavTabs("library");
  } else if (isRecord) {
    updateNavTabs("record");
  }
}

function initSettingsUI() {
  els.themeSelect.value = settings.theme;
  els.langSelect.value = settings.language;
  els.zoomSmoothSlider.value = String(Math.round((1 - settings.zoomSmoothness) * 20 + 2));
  applyTheme(settings.theme);
}

// Zoom controls
els.zoomInBtn.addEventListener("click", () => zoom.zoomIn());
els.zoomOutBtn.addEventListener("click", () => zoom.zoomOut());
els.zoomResetBtn.addEventListener("click", () => zoom.reset());

els.previewWrap.addEventListener("click", (e) => {
  if (recorder.phase === "idle") return;
  const rect = els.previewWrap.getBoundingClientRect();
  const nx = (e.clientX - rect.left) / rect.width;
  const ny = (e.clientY - rect.top) / rect.height;
  zoom.setCenter(nx, ny);
  if (recorder.phase === "preview") zoom.zoomIn(1.2, nx, ny);
});

async function openSourcePicker() {
  if (!window.zetro?.getSources) {
    setStatus("Electron API tidak tersedia. Restart aplikasi.", true, true);
    return;
  }

  els.sourceModal.classList.remove("hidden");
  els.sourceModal.classList.add("flex");
  els.sourceList.innerHTML = "";
  els.sourceLoading.classList.remove("hidden");

  try {
    const sources = await window.zetro.getSources();
    els.sourceLoading.classList.add("hidden");

    if (!sources.length) {
      els.sourceList.innerHTML = `<p class="col-span-2 p-4 text-center text-sm text-gpt-muted">${tr("noSources")}</p>`;
      return;
    }

    const screens = sources.filter((s) => s.id.startsWith("screen:"));
    const windows = sources.filter((s) => !s.id.startsWith("screen:"));
    const ordered = [...screens, ...windows];

    els.sourceList.innerHTML = ordered
      .map(
        (s) => `
      <button type="button" class="source-item flex flex-col gap-2 rounded-xl border border-gpt bg-gpt-surface p-2 text-left transition hover:border-gpt-accent hover:ring-2 hover:ring-gpt-accent/20" data-id="${s.id}">
        <img src="${s.thumbnail}" alt="" class="aspect-video w-full rounded-lg bg-black object-cover" />
        <span class="truncate px-1 text-xs font-medium text-gpt-text">${s.name}</span>
      </button>`
      )
      .join("");

    els.sourceList.querySelectorAll(".source-item").forEach((btn) => {
      btn.addEventListener("click", () => onSourcePicked(btn.dataset.id));
    });
  } catch (err) {
    els.sourceLoading.classList.add("hidden");
    closeSourcePicker();
    setStatus(err.message, true, true);
    console.error(err);
  }
}

function closeSourcePicker() {
  els.sourceModal.classList.add("hidden");
  els.sourceModal.classList.remove("flex");
}

async function onSourcePicked(sourceId) {
  closeSourcePicker();
  setStatus("selecting");
  els.selectScreenBtn.disabled = true;

  try {
    await recorder.preparePreview({ ...getOpts(), sourceId });
  } catch (err) {
    const key =
      err.message === "previewLoadFail" || err.message === "webmUnsupported"
        ? err.message
        : null;
    setStatus(key || err.message, true, !key);
    recorder.cancelPreview();
    console.error(err);
  } finally {
    if (recorder.phase === "idle") els.selectScreenBtn.disabled = false;
  }
}

// Main actions
els.selectScreenBtn.addEventListener("click", openSourcePicker);
els.sourceCancelBtn.addEventListener("click", closeSourcePicker);

els.confirmRecordBtn.addEventListener("click", () => {
  recorder.startRecording();
});

els.cancelPreviewBtn.addEventListener("click", () => {
  recorder.cancelPreview();
});

els.stopBtn.addEventListener("click", () => {
  recorder.stopRecording();
});

els.micToggle.addEventListener("click", async () => {
  setToggle(els.micToggle, els.micToggle.dataset.on !== "1");
  if (recorder.phase === "idle") return;
  await applyMicFromUI();
});

els.camToggle.addEventListener("click", async () => {
  setToggle(els.camToggle, els.camToggle.dataset.on !== "1");
  if (recorder.phase === "idle") return;
  await applyCamFromUI();
});

els.micSelect.addEventListener("change", async () => {
  if (recorder.phase === "idle") return;
  if (els.micToggle.dataset.on !== "1") {
    setToggle(els.micToggle, true);
  }
  await applyMicFromUI();
});

els.camSelect.addEventListener("change", async () => {
  if (recorder.phase === "idle") return;
  if (els.camToggle.dataset.on !== "1") {
    setToggle(els.camToggle, true);
  }
  await applyCamFromUI();
});

els.settingsBtn.addEventListener("click", openSettings);
els.backBtn.addEventListener("click", closeSettings);

document.getElementById("navRecordBtn")?.addEventListener("click", () => showView("record"));
document.getElementById("navLibraryBtn")?.addEventListener("click", () => showView("library"));
document.querySelectorAll(".nav-to-record").forEach((btn) => {
  btn.addEventListener("click", () => showView("record"));
});
document.querySelectorAll(".nav-to-library").forEach((btn) => {
  btn.addEventListener("click", () => showView("library"));
});
els.themeSelect.addEventListener("change", () => {
  settings = saveSettings({ theme: els.themeSelect.value });
  applyTheme(settings.theme);
});

els.langSelect.addEventListener("change", () => {
  settings = saveSettings({ language: els.langSelect.value });
  lang = settings.language;
  applyI18n();
  populateDevices();
});

els.zoomSmoothSlider.addEventListener("input", () => {
  const v = Number(els.zoomSmoothSlider.value);
  const smoothness = 1 - (v - 2) / 20;
  settings = saveSettings({ zoomSmoothness: smoothness });
  zoom.setSmoothness(smoothness);
});

watchSystemTheme(() => {
  if (settings.theme === "system") applyTheme("system");
});

// Init
initSettingsUI();
applyI18n();
setToggle(els.micToggle, true);
setToggle(els.camToggle, true);
populateDevices();
handlePhase("idle");
zoom.setSmoothness(settings.zoomSmoothness);
