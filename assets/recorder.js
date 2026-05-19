import { SmoothZoom } from "./zoom.js";

// VP8 first — avoids VP9 alpha decode errors on Linux (GStreamer / Totem)
const MIME_TYPES = ["video/webm;codecs=vp8,opus", "video/webm;codecs=vp8", "video/webm"];

function pickMimeType() {
  return MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

export function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function waitForVideoDimensions(video, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const done = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        cleanup();
        resolve({ w: video.videoWidth, h: video.videoHeight });
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", done);
      video.removeEventListener("loadeddata", done);
      video.removeEventListener("resize", done);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("previewLoadFail"));
    }, timeoutMs);
    video.addEventListener("loadedmetadata", done);
    video.addEventListener("loadeddata", done);
    video.addEventListener("resize", done);
    done();
  });
}

export class ZetroRecorder {
  constructor({
    screenPreview,
    previewViewport,
    camPreview,
    compositeCanvas,
    zoom,
    onPhaseChange,
    onPreviewSignal,
    onTimer,
    onSaved,
    onScreenShareEnded,
  }) {
    this.screenPreview = screenPreview;
    this.previewViewport = previewViewport;
    this.camPreview = camPreview;
    this.canvas = compositeCanvas;
    this.ctx = this.canvas.getContext("2d", { alpha: false });
    this.zoom = zoom ?? new SmoothZoom();
    this.onPhaseChange = onPhaseChange;
    this.onPreviewSignal = onPreviewSignal;
    this.onTimer = onTimer;
    this.onSaved = onSaved;
    this.onScreenShareEnded = onScreenShareEnded;
    this._handlingScreenEnd = false;

    /** @type {'idle'|'preview'|'recording'} */
    this.phase = "idle";
    this.mediaRecorder = null;
    this.chunks = [];
    this.mimeType = "";
    this.timerId = null;
    this.startedAt = 0;
    this.drawId = null;
    this.previewAnimId = null;

    this.screenStream = null;
    this.micStream = null;
    this.camStream = null;
    this.audioContext = null;
    this.audioDest = null;
    this.screenSourceNode = null;
    this.micSourceNode = null;
    this.micGain = null;
    this.micEnabled = false;
    this.camEnabled = false;
  }

  stopMicStream() {
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micStream = null;
  }

  stopCamStream() {
    this.camStream?.getTracks().forEach((t) => t.stop());
    this.camStream = null;
  }

  teardownAudioGraph() {
    this.micSourceNode?.disconnect();
    this.screenSourceNode?.disconnect();
    this.micGain?.disconnect();
    this.micSourceNode = null;
    this.screenSourceNode = null;
    this.micGain = null;
    this.audioDest = null;
    this.audioContext?.close();
    this.audioContext = null;
  }

  initAudioGraph() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext();
    this.audioDest = this.audioContext.createMediaStreamDestination();
    this.micGain = this.audioContext.createGain();
    this.micGain.gain.value = 1.05;
    this.micGain.connect(this.audioDest);

    this.reconnectScreenAudio();
    this.reconnectMicAudio();
  }

  reconnectScreenAudio() {
    this.screenSourceNode?.disconnect();
    this.screenSourceNode = null;

    const screenAudio = this.screenStream?.getAudioTracks()[0];
    if (screenAudio && this.audioContext && this.audioDest) {
      this.screenSourceNode = this.audioContext.createMediaStreamSource(
        new MediaStream([screenAudio])
      );
      this.screenSourceNode.connect(this.audioDest);
    }
  }

  reconnectMicAudio() {
    this.micSourceNode?.disconnect();
    this.micSourceNode = null;

    const micAudio = this.micStream?.getAudioTracks()[0];
    if (micAudio && this.micEnabled && this.audioContext && this.micGain) {
      this.micSourceNode = this.audioContext.createMediaStreamSource(new MediaStream([micAudio]));
      this.micSourceNode.connect(this.micGain);
    }
  }

  async applyMic({ enabled, micId }) {
    this.micEnabled = enabled;
    this.stopMicStream();
    this.reconnectMicAudio();

    if (!enabled) return;

    this.micStream = await navigator.mediaDevices.getUserMedia({
      audio: micId ? { deviceId: { exact: micId } } : true,
      video: false,
    });
    this.reconnectMicAudio();
  }

  async applyCam({ enabled, camId }) {
    this.camEnabled = enabled;
    this.stopCamStream();
    this.camPreview.srcObject = null;

    if (!enabled) {
      this.camPreview.classList.add("hidden");
      return;
    }

    this.camStream = await navigator.mediaDevices.getUserMedia({
      video: camId
        ? { deviceId: { exact: camId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
    this.camPreview.srcObject = this.camStream;
    this.camPreview.classList.remove("hidden");
    await this.camPreview.play();
  }

  async loadDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      mics: devices.filter((d) => d.kind === "audioinput"),
      cameras: devices.filter((d) => d.kind === "videoinput"),
    };
  }

  setPhase(phase) {
    this.phase = phase;
    this.onPhaseChange?.(phase);
  }

  async captureScreen(sourceId) {
    if (sourceId) {
      const desktopVideo = {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        minWidth: 640,
        minHeight: 480,
        maxFrameRate: 30,
      };
      const desktopAudio = {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
      };

      const attempts = [
        () =>
          navigator.mediaDevices.getUserMedia({
            audio: { mandatory: desktopAudio },
            video: { mandatory: desktopVideo },
          }),
        () =>
          navigator.mediaDevices.getUserMedia({
            audio: desktopAudio,
            video: desktopVideo,
          }),
        () =>
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: { mandatory: desktopVideo },
          }),
        () =>
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: desktopVideo,
          }),
      ];

      let lastErr;
      for (const tryGet of attempts) {
        try {
          return await tryGet();
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr;
    }

    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 30 } },
      audio: true,
    });
  }

  async preparePreview({ sourceId, micEnabled, camEnabled, micId, camId }) {
    this.mimeType = pickMimeType();
    if (!this.mimeType) throw new Error("webmUnsupported");

    this.screenStream = await this.captureScreen(sourceId);

    const videoTrack = this.screenStream.getVideoTracks()[0];
    if (!videoTrack) throw new Error("previewLoadFail");

    videoTrack.onended = () => this.handleScreenShareEnded();

    this.screenPreview.srcObject = this.screenStream;
    await this.screenPreview.play();

    // Show preview immediately — don't wait for dimensions behind overlay
    this.setPhase("preview");
    this.startPreviewLoop();

    try {
      const { w, h } = await waitForVideoDimensions(this.screenPreview, 15000);
      this.canvas.width = w;
      this.canvas.height = h;
      this.onPreviewSignal?.(true);
    } catch {
      this.onPreviewSignal?.(false);
      throw new Error("previewLoadFail");
    }

    try {
      await this.applyMic({ enabled: micEnabled, micId });
    } catch {
      this.micEnabled = false;
    }

    try {
      await this.applyCam({ enabled: camEnabled, camId });
    } catch {
      this.camEnabled = false;
      this.camPreview.classList.add("hidden");
    }
  }

  startPreviewLoop() {
    const tick = () => {
      if (this.phase !== "preview") return;

      const hasSignal = this.screenPreview.readyState >= 2 && this.screenPreview.videoWidth > 0;
      this.onPreviewSignal?.(hasSignal);

      if (this.previewViewport) {
        this.zoom.applyPreviewStyles(this.previewViewport);
      }

      this.previewAnimId = requestAnimationFrame(tick);
    };
    tick();
  }

  startRecording() {
    if (this.phase !== "preview") return;

    cancelAnimationFrame(this.previewAnimId);
    this.setPhase("recording");

    const compositeStream = this.buildCompositeStream();
    this.startCompositeLoop();

    this.mediaRecorder = new MediaRecorder(compositeStream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: 8_000_000,
    });
    this.chunks = [];

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data?.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.onstop = () => this.handleStop();
    this.mediaRecorder.start(500);

    this.startedAt = Date.now();
    this.timerId = setInterval(() => {
      this.onTimer?.(formatTime(Date.now() - this.startedAt));
    }, 250);
  }

  handleScreenShareEnded() {
    if (this._handlingScreenEnd || this.phase === "idle") return;
    this._handlingScreenEnd = true;

    if (this.phase === "recording") {
      this.onScreenShareEnded?.("recording");
      this.stopRecording();
    } else if (this.phase === "preview") {
      this.onScreenShareEnded?.("preview");
      this.cancelPreview();
    }

    this._handlingScreenEnd = false;
  }

  stopRecording() {
    if (this.mediaRecorder?.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }

  cancelPreview() {
    cancelAnimationFrame(this.previewAnimId);
    cancelAnimationFrame(this.drawId);
    clearInterval(this.timerId);
    this.stopAllStreams();
    this.teardownAudioGraph();
    this.zoom.reset();
    if (this.previewViewport) {
      this.previewViewport.style.transform = "scale(1)";
    }
    this.setPhase("idle");
    this.onPreviewSignal?.(false);
    this.onTimer?.("00:00");
    this._handlingScreenEnd = false;
  }

  usesDirectScreenCapture() {
    return !this.camEnabled && this.zoom.scale <= 1.02 && this.zoom.targetScale <= 1.02;
  }

  buildCompositeStream() {
    this.initAudioGraph();
    const audioTracks = this.audioDest.stream.getAudioTracks();

    if (this.usesDirectScreenCapture()) {
      const tracks = [...this.screenStream.getVideoTracks(), ...audioTracks];
      return new MediaStream(tracks);
    }

    const canvasStream = this.canvas.captureStream(30);
    const tracks = [...canvasStream.getVideoTracks(), ...audioTracks];
    return new MediaStream(tracks);
  }

  drawCamOverlay(ctx, camVideo, canvas) {
    if (!this.camEnabled || camVideo.readyState < 2) return;

    const pipW = canvas.width * 0.18;
    const pipH = pipW * (camVideo.videoHeight / camVideo.videoWidth || 9 / 16);
    const pad = Math.round(canvas.width * 0.02);
    const x = canvas.width - pipW - pad;
    const y = canvas.height - pipH - pad;

    ctx.save();
    roundRect(ctx, x, y, pipW, pipH, 16);
    ctx.clip();
    ctx.drawImage(camVideo, x, y, pipW, pipH);
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, pipW, pipH, 16);
    ctx.strokeStyle = "rgba(16, 163, 127, 0.9)";
    ctx.lineWidth = Math.max(2, canvas.width * 0.0025);
    ctx.stroke();
    ctx.restore();
  }

  startCompositeLoop() {
    const screenVideo = this.screenPreview;
    const camVideo = this.camPreview;
    const { canvas, ctx, zoom } = this;

    const draw = () => {
      if (this.phase !== "recording") return;

      if (screenVideo.readyState >= 2) {
        zoom.draw(ctx, screenVideo, canvas.width, canvas.height);
        this.drawCamOverlay(ctx, camVideo, canvas);
      }

      this.drawId = requestAnimationFrame(draw);
    };
    draw();
  }

  handleStop() {
    clearInterval(this.timerId);
    cancelAnimationFrame(this.drawId);
    const size = this.chunks.reduce((a, c) => a + c.size, 0);

    this.stopAllStreams();
    this.teardownAudioGraph();
    this.zoom.reset();
    if (this.previewViewport) {
      this.previewViewport.style.transform = "scale(1)";
    }

    this.setPhase("idle");
    this.onPreviewSignal?.(false);
    this.onTimer?.("00:00");
    this._handlingScreenEnd = false;

    if (size === 0) {
      this.onSaved?.({ ok: false, reason: "minRecord" });
      return;
    }

    const mimeBase = this.mimeType.split(";")[0] || "video/webm";
    const blob = new Blob(this.chunks, { type: mimeBase });
    this.chunks = [];

    this.onSaved?.({
      ok: true,
      blob,
      sizeMb: (blob.size / 1024 / 1024).toFixed(2),
      filename: `zetro-${Date.now()}.webm`,
    });
  }

  stopAllStreams() {
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.stopMicStream();
    this.stopCamStream();
    this.screenStream = null;
    this.screenPreview.srcObject = null;
    this.camPreview.srcObject = null;
    this.camPreview.classList.add("hidden");
    this.micEnabled = false;
    this.camEnabled = false;
  }
}
