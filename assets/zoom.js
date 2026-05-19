/** Apple-style smooth zoom — always kept inside screen bounds */
export class SmoothZoom {
  constructor(smoothness = 0.06) {
    this.smoothness = smoothness;
    this.scale = 1;
    this.targetScale = 1;
    this.centerX = 0.5;
    this.centerY = 0.5;
    this.targetCenterX = 0.5;
    this.targetCenterY = 0.5;
    this.maxScale = 3;
    this.minScale = 1;
  }

  setSmoothness(value) {
    this.smoothness = Math.max(0.02, Math.min(0.2, value));
  }

  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /** Valid center range so crop rect never leaves the source */
  centerBounds(scale) {
    const s = Math.max(1, scale);
    const margin = 0.5 / s;
    return { min: margin, max: 1 - margin };
  }

  clampCenterValue(value, scale) {
    const { min, max } = this.centerBounds(scale);
    return Math.max(min, Math.min(max, value));
  }

  enforceBounds() {
    const s = Math.max(this.scale, this.targetScale);
    this.centerX = this.clampCenterValue(this.centerX, s);
    this.centerY = this.clampCenterValue(this.centerY, s);
    this.targetCenterX = this.clampCenterValue(this.targetCenterX, s);
    this.targetCenterY = this.clampCenterValue(this.targetCenterY, s);
  }

  tick() {
    const t = this.smoothness;
    this.scale = this.lerp(this.scale, this.targetScale, t);
    this.centerX = this.lerp(this.centerX, this.targetCenterX, t);
    this.centerY = this.lerp(this.centerY, this.targetCenterY, t);
    this.enforceBounds();
  }

  setCenter(nx, ny) {
    const s = Math.max(this.scale, this.targetScale);
    this.targetCenterX = this.clampCenterValue(nx, s);
    this.targetCenterY = this.clampCenterValue(ny, s);
  }

  zoomIn(factor = 1.28, nx = this.centerX, ny = this.centerY) {
    this.targetScale = Math.min(this.maxScale, this.targetScale * factor);
    this.setCenter(nx, ny);
    this.enforceBounds();
  }

  zoomOut(factor = 1.28) {
    this.targetScale = Math.max(this.minScale, this.targetScale / factor);
    if (this.targetScale <= 1.02) this.reset();
    else this.enforceBounds();
  }

  reset() {
    this.targetScale = 1;
    this.scale = 1;
    this.centerX = 0.5;
    this.centerY = 0.5;
    this.targetCenterX = 0.5;
    this.targetCenterY = 0.5;
  }

  /** Crop source rect (never outside video) */
  getCropRect(width, height, scale = this.scale) {
    const s = Math.max(1, scale);
    const cx = this.clampCenterValue(this.centerX, s) * width;
    const cy = this.clampCenterValue(this.centerY, s) * height;
    const sw = width / s;
    const sh = height / s;
    let sx = cx - sw / 2;
    let sy = cy - sh / 2;
    sx = Math.max(0, Math.min(width - sw, sx));
    sy = Math.max(0, Math.min(height - sh, sy));
    return { sx, sy, sw, sh };
  }

  draw(ctx, video, width, height) {
    this.tick();
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    const { sx, sy, sw, sh } = this.getCropRect(width, height);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  }

  /** Preview: scale around focal point, clipped by overflow-hidden parent */
  applyPreviewStyles(el) {
    this.tick();
    const s = this.scale;
    const cx = this.clampCenterValue(this.centerX, s);
    const cy = this.clampCenterValue(this.centerY, s);
    el.style.transformOrigin = `${cx * 100}% ${cy * 100}%`;
    el.style.transform = `scale(${s})`;
  }

  /** @deprecated use applyPreviewStyles */
  getCssTransform() {
    this.tick();
    const s = this.scale;
    const cx = this.clampCenterValue(this.centerX, s);
    const cy = this.clampCenterValue(this.centerY, s);
    return `scale(${s})`;
  }
}
