/**
 * Authored Canvas 2D interpretation of React Bits' Shape Waves visual concept.
 * https://reactbits.dev/backgrounds/shape-waves
 * No upstream shader, noise implementation, or runtime code is copied.
 */
const PITCH = 24;
const MAX_CELLS = 7000;
const FRAME_INTERVAL = 1000 / 30;
const LEVELS = 18;
const TINT_LEVELS = 10;
const RIPPLE_STEP = 1 / 60;
const SPLASH_RADIUS = 50;
const SPLASH_SIGMA = 20;
export const TERMINAL_GLYPHS = ['>', '_', '$', '/', '~', '|', '{', '}', '+'] as const;
export const TERMINAL_GLYPH_STROKE = 1.1;
const GLYPH_COUNT = TERMINAL_GLYPHS.length;

type GlyphCommand = readonly ['M' | 'L' | 'Q', ...number[]];
// Authored terminal strokes, independent of font loading. All coordinates fit
// within +/-5px; even with round caps they stay inside the 14px clearing tile.
const GLYPH_COMMANDS: readonly (readonly GlyphCommand[])[] = [
  [['M', -3.5, -4], ['L', 3.5, 0], ['L', -3.5, 4]],
  [['M', -4, 4.5], ['L', 4, 4.5]],
  [['M', 3, -3], ['Q', 1, -5, -2, -3.5], ['Q', -5, -1.5, 0, 0], ['Q', 5, 1.5, 2, 3.5], ['Q', -1, 5, -3, 3], ['M', 0, -5], ['L', 0, 5]],
  [['M', -3.5, 5], ['L', 3.5, -5]],
  [['M', -4, 0.8], ['Q', -2, -2, 0, 0], ['Q', 2, 2, 4, -0.8]],
  [['M', 0, -5], ['L', 0, 5]],
  [['M', 2, -5], ['Q', -1, -5, -1, -2], ['L', -1, -1], ['Q', -1, 0, -3, 0], ['Q', -1, 0, -1, 1], ['L', -1, 2], ['Q', -1, 5, 2, 5]],
  [['M', -2, -5], ['Q', 1, -5, 1, -2], ['L', 1, -1], ['Q', 1, 0, 3, 0], ['Q', 1, 0, 1, 1], ['L', 1, 2], ['Q', 1, 5, -2, 5]],
  [['M', 0, -4], ['L', 0, 4], ['M', -4, 0], ['L', 4, 0]],
];

export const terminalGlyphOpacity = (index: number) => 0.62 + index / (GLYPH_COUNT - 1) * 0.32;
const levelScale = (level: number) => 0.9 + level / (LEVELS - 1) * 0.1;

function terminalGlyphPath(glyph: number, x = 0, y = 0, scale = 1): string {
  return GLYPH_COMMANDS[glyph].map(([command, ...coordinates]) => command + coordinates.map((value, index) =>
    Number((value * scale + (index % 2 ? y : x)).toFixed(2)),
  ).join(' ')).join('');
}

const fieldLevel = (x: number, y: number, time: number) => Math.floor(sampleField(x, y, time) * LEVELS);
type Cell = { x: number; y: number; level: number; glyph: number };
type Rgb = [number, number, number];

/** Canvas resolves named colors and short/modern rgb syntax before parsing. */
function normalizedSrgb(context: CanvasRenderingContext2D, color: string, fallback: string): Rgb {
  context.fillStyle = fallback;
  context.fillStyle = color;
  const resolved = String(context.fillStyle);
  const hex = /^#([\da-f]{6})$/i.exec(resolved)?.[1];
  if (hex) return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as Rgb;
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(resolved);
  const srgb = /^color\(srgb\s+([^)]+)\)$/i.exec(resolved);
  const channels = (rgb?.[1] ?? srgb?.[1])?.split(/[\s,/]+/).slice(0, 3).map((value) => {
    const scale = value.endsWith('%') ? 255 / 100 : srgb ? 255 : 1;
    return Math.round(Math.max(0, Math.min(255, parseFloat(value) * scale)));
  });
  if (channels?.length === 3 && channels.every(Number.isFinite)) return channels as Rgb;
  return [0, 2, 4].map((offset) => parseInt(fallback.slice(offset + 1, offset + 3), 16)) as Rgb;
}

// Broad, continuous bands: adjacent cells sample nearby values rather than
// independent random shapes. Time is elapsed active time, so pausing freezes it.
function sampleField(x: number, y: number, time: number): number {
  const drift = time * 0.065;
  const warp = Math.sin(x * 0.0038 + y * 0.0029 + drift) * 1.15;
  return Math.max(0, Math.min(0.9999, 0.5 + (
    Math.sin(x * 0.0068 - y * 0.0051 + warp + drift) * 0.58
    + Math.sin(x * 0.0031 + y * 0.0077 - drift * 0.7 + 1.8) * 0.3
    + Math.sin(x * 0.011 + y * 0.009 + drift * 0.45) * 0.12
  ) * 0.5));
}

function forEachCell(width: number, height: number, time: number, visit: (cell: Cell) => void) {
  let pitch = Math.max(PITCH, Math.sqrt(width * height / MAX_CELLS));
  while (Math.ceil(width / pitch) * Math.ceil(height / pitch) > MAX_CELLS) pitch *= 1.01;
  const columns = Math.ceil(width / pitch);
  const rows = Math.ceil(height / pitch);
  const offsetX = (width - (columns - 1) * pitch) / 2;
  const offsetY = (height - (rows - 1) * pitch) / 2;
  for (let row = 0; row < rows; row++) {
    const y = offsetY + row * pitch;
    for (let column = 0; column < columns; column++) {
      const x = offsetX + column * pitch;
      const level = fieldLevel(x, y, time);
      visit({ x, y, level, glyph: Math.floor(level / (LEVELS / GLYPH_COUNT)) });
    }
  }
}

/** Nine compound stroke paths keep the server-rendered fallback DOM small. */
export function staticShapePaths(width = 1600, height = 1000): string[] {
  const paths = Array<string>(GLYPH_COUNT).fill('');
  forEachCell(width, height, 0, ({ x, y, level, glyph }) => {
    paths[glyph] += terminalGlyphPath(glyph, x, y, levelScale(level));
  });
  return paths;
}

export function registerShapeWaves() {
  if (customElements.get('lomi-shape-waves')) return;

  class ShapeWaves extends HTMLElement {
    private context: CanvasRenderingContext2D | null = null;
    private canvas: HTMLCanvasElement | null = null;
    private resizeObserver?: ResizeObserver;
    private intersectionObserver?: IntersectionObserver;
    private preference?: MediaQueryList;
    private finePointer?: MediaQueryList;
    private pointerTarget: HTMLElement | null = null;
    private pointer = { x: 0, y: 0, at: 0, inside: false };
    private frame = 0;
    private lastFrame = 0;
    private time = 0;
    private width = 0;
    private height = 0;
    private visible = false;
    private failed = false;
    private background = '#0b0e0b';
    private interactionRgb: Rgb = [255, 255, 255];
    private hoverColors: string[] = [];
    private glyphPaths: Path2D[] = [];
    private glowSprite: HTMLCanvasElement | null = null;
    private glowDpr = 0;
    private cellX = new Float64Array(0);
    private cellY = new Float64Array(0);
    private paintKeys = new Int16Array(0);
    private dirtyCells = new Uint16Array(0);
    private heights = new Float32Array(0);
    private velocities = new Float32Array(0);
    private nextHeights = new Float32Array(0);
    private columns = 0;
    private rows = 0;
    private pitch = PITCH;
    private ripplesActive = false;
    private rippleBacklog = 0;
    private fullRedraw = true;

    connectedCallback() {
      this.canvas = this.querySelector('canvas');
      this.failed = false;
      // Reconnection must present the current field even while paused.
      this.width = 0;
      this.height = 0;
      this.dataset.renderer = 'fallback';
      try {
        this.preference = matchMedia('(prefers-reduced-motion: reduce)');
        this.finePointer = matchMedia('(any-pointer: fine)');
        // The server-rendered SVG is the same initial field. Coarse-pointer
        // devices cannot use the canvas interaction, so keep that complete
        // visual fallback instead of starting its continuous CPU-heavy loop.
        if (!this.finePointer.matches) {
          this.dataset.state = this.preference.matches ? 'reduced' : 'fallback';
          return;
        }
        this.context = this.canvas?.getContext('2d', { alpha: false }) ?? null;
        if (!this.context || typeof Path2D === 'undefined') return this.fail();
        const bounds = this.getBoundingClientRect();
        this.visible = bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
        const style = getComputedStyle(this);
        const background = normalizedSrgb(this.context, style.getPropertyValue('--shape-waves-background').trim(), '#0b0e0b');
        this.background = `rgb(${background.join(',')})`;
        const rgb = normalizedSrgb(this.context, style.getPropertyValue('--shape-waves-color').trim(), '#4f633a');
        this.interactionRgb = normalizedSrgb(this.context, style.getPropertyValue('--shape-waves-interaction-color').trim(), '#ffffff');
        this.hoverColors = Array.from({ length: TINT_LEVELS }, (_, index) =>
          `rgb(${rgb.map((channel, channelIndex) => Math.round(channel + (this.interactionRgb[channelIndex] - channel) * index / (TINT_LEVELS - 1))).join(',')})`,
        );
        this.glyphPaths = Array.from({ length: LEVELS * GLYPH_COUNT }, (_, index) =>
          new Path2D(terminalGlyphPath(index % GLYPH_COUNT, 0, 0, levelScale(Math.floor(index / GLYPH_COUNT)))),
        );
        this.resize();
        this.resizeObserver = new ResizeObserver(this.resize);
        this.resizeObserver.observe(this);
        this.intersectionObserver = new IntersectionObserver(([entry]) => {
          this.visible = entry.isIntersecting;
          this.syncMotion();
        });
        this.intersectionObserver.observe(this);
        document.addEventListener('lomi:hero-motion', this.syncMotion);
        document.addEventListener('visibilitychange', this.syncMotion);
        this.preference.addEventListener('change', this.syncMotion);
        this.pointerTarget = this.closest<HTMLElement>('.hero');
        this.pointerTarget?.addEventListener('pointermove', this.handlePointerMove, { passive: true });
        this.pointerTarget?.addEventListener('pointerleave', this.resetPointer, { passive: true });
        this.syncMotion();
      } catch {
        this.fail();
      }
    }

    disconnectedCallback() {
      this.stop();
      this.resizeObserver?.disconnect();
      this.intersectionObserver?.disconnect();
      document.removeEventListener('lomi:hero-motion', this.syncMotion);
      document.removeEventListener('visibilitychange', this.syncMotion);
      this.preference?.removeEventListener('change', this.syncMotion);
      this.pointerTarget?.removeEventListener('pointermove', this.handlePointerMove);
      this.pointerTarget?.removeEventListener('pointerleave', this.resetPointer);
      this.pointerTarget = null;
      this.resetPointer();
      this.heights = new Float32Array(0);
      this.velocities = new Float32Array(0);
      this.nextHeights = new Float32Array(0);
      this.cellX = new Float64Array(0);
      this.cellY = new Float64Array(0);
      this.paintKeys = new Int16Array(0);
      this.dirtyCells = new Uint16Array(0);
      this.ripplesActive = false;
      this.rippleBacklog = 0;
      this.glowSprite = null;
      this.glowDpr = 0;
      this.glyphPaths = [];
    }

    private stop() {
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = 0;
      this.lastFrame = 0;
    }

    private fail() {
      this.failed = true;
      this.disconnectedCallback();
      this.dataset.renderer = 'fallback';
      this.dataset.state = 'fallback';
    }

    private motionState() {
      const motion = this.closest<HTMLElement>('.hero')?.dataset.motion;
      if (this.preference?.matches || motion === 'reduced') return 'reduced';
      if (motion === 'paused') return 'paused';
      if (document.hidden) return 'hidden';
      if (!this.visible) return 'offscreen';
      return 'running';
    }

    private syncMotion = () => {
      if (this.failed || !this.isConnected) return;
      const state = this.motionState();
      this.dataset.state = state;
      if (state !== 'running') {
        this.stop();
        this.resetPointer();
      }
      else if (!this.frame && this.width && this.height) this.frame = requestAnimationFrame(this.tick);
    };

    private resetPointer = () => {
      this.pointer.inside = false;
    };

    private handlePointerMove = (event: PointerEvent) => {
      if (this.failed || event.pointerType === 'touch' || !this.finePointer?.matches || this.motionState() !== 'running') {
        this.resetPointer();
        return;
      }
      const bounds = this.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      if (x < 0 || y < 0 || x > this.width || y > this.height || !this.heights.length) {
        this.resetPointer();
        return;
      }
      const now = performance.now();
      const elapsed = this.pointer.inside ? Math.max(8, now - this.pointer.at) : 16;
      const distance = this.pointer.inside ? Math.hypot(x - this.pointer.x, y - this.pointer.y) : 0;
      const strength = 0.4 * Math.min(1, 0.22 + distance / elapsed * 1000 * 0.0006);
      const minColumn = Math.max(0, Math.ceil((x - SPLASH_RADIUS - this.cellX[0]) / this.pitch));
      const maxColumn = Math.min(this.columns - 1, Math.floor((x + SPLASH_RADIUS - this.cellX[0]) / this.pitch));
      const minRow = Math.max(0, Math.ceil((y - SPLASH_RADIUS - this.cellY[0]) / this.pitch));
      const maxRow = Math.min(this.rows - 1, Math.floor((y + SPLASH_RADIUS - this.cellY[0]) / this.pitch));
      for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
          const index = row * this.columns + column;
          const dx = this.cellX[index] - x;
          const dy = this.cellY[index] - y;
          const bump = strength * Math.exp(-(dx * dx + dy * dy) / (2 * SPLASH_SIGMA * SPLASH_SIGMA));
          const next = Math.min(1.2, this.heights[index] + bump);
          this.velocities[index] += next - this.heights[index];
          this.heights[index] = next;
        }
      }
      this.ripplesActive = true;
      this.pointer = { x, y, at: now, inside: true };
    };

    private updateRipples(delta: number) {
      if (!this.ripplesActive) return;
      this.rippleBacklog = Math.min(this.rippleBacklog + delta, RIPPLE_STEP * 4);
      while (this.rippleBacklog >= RIPPLE_STEP) {
        this.rippleBacklog -= RIPPLE_STEP;
        let peak = 0;
        for (let row = 0; row < this.rows; row++) {
          const base = row * this.columns;
          const above = (row ? row - 1 : row) * this.columns;
          const below = (row + 1 < this.rows ? row + 1 : row) * this.columns;
          for (let column = 0; column < this.columns; column++) {
            const index = base + column;
            const height = this.heights[index];
            const left = base + (column ? column - 1 : column);
            const right = base + (column + 1 < this.columns ? column + 1 : column);
            const laplacian = this.heights[left] + this.heights[right] + this.heights[above + column] + this.heights[below + column] - 4 * height;
            const next = (height + this.velocities[index] * 0.94 + laplacian * 0.42) * 0.972;
            this.nextHeights[index] = next;
            this.velocities[index] = next - height;
            peak = Math.max(peak, next);
          }
        }
        const previous = this.heights;
        this.heights = this.nextHeights;
        this.nextHeights = previous;
        if (peak < 0.01) {
          this.heights.fill(0);
          this.velocities.fill(0);
          this.nextHeights.fill(0);
          this.ripplesActive = false;
          this.rippleBacklog = 0;
          break;
        }
      }
    }

    private resize = () => {
      if (this.failed || !this.canvas || !this.context) return;
      const { width, height } = this.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const pixelWidth = Math.max(1, Math.round(width * dpr));
      const pixelHeight = Math.max(1, Math.round(height * dpr));
      if (width === this.width && height === this.height && this.canvas.width === pixelWidth && this.canvas.height === pixelHeight) return;
      this.width = width;
      this.height = height;
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (this.glowDpr !== dpr) {
        this.glowSprite = document.createElement('canvas');
        this.glowSprite.width = this.glowSprite.height = Math.ceil(14 * dpr);
        const glow = this.glowSprite.getContext('2d');
        if (glow) {
          glow.setTransform(this.glowSprite.width / 14, 0, 0, this.glowSprite.height / 14, 0, 0);
          const gradient = glow.createRadialGradient(7, 7, 0, 7, 7, 6.5);
          const color = this.interactionRgb.join(',');
          gradient.addColorStop(0, `rgba(${color},0.24)`);
          gradient.addColorStop(0.5, `rgba(${color},0.1)`);
          gradient.addColorStop(1, `rgba(${color},0)`);
          glow.fillStyle = gradient;
          glow.fillRect(0, 0, 14, 14);
        }
        this.glowDpr = dpr;
      }
      // Grid allocation and coordinate generation happen only on resize.
      const cells: Cell[] = [];
      forEachCell(width, height, this.time, (cell) => cells.push(cell));
      this.cellX = Float64Array.from(cells, (cell) => cell.x);
      this.cellY = Float64Array.from(cells, (cell) => cell.y);
      this.columns = cells.findIndex((cell) => cell.y !== cells[0]?.y);
      if (this.columns < 0) this.columns = cells.length;
      this.rows = this.columns ? cells.length / this.columns : 0;
      this.pitch = this.columns > 1 ? cells[1].x - cells[0].x : PITCH;
      this.paintKeys = new Int16Array(cells.length).fill(-1);
      this.dirtyCells = new Uint16Array(cells.length);
      this.heights = new Float32Array(cells.length);
      this.velocities = new Float32Array(cells.length);
      this.nextHeights = new Float32Array(cells.length);
      this.ripplesActive = false;
      this.rippleBacklog = 0;
      this.resetPointer();
      this.fullRedraw = true;
      // Resize always draws once, including while paused or offscreen.
      this.draw();
      this.syncMotion();
    };

    private draw() {
      if (!this.context || !this.width || !this.height) return;
      try {
        let dirtyCount = 0;
        for (let index = 0; index < this.paintKeys.length; index++) {
          const level = fieldLevel(this.cellX[index], this.cellY[index], this.time);
          const charge = Math.max(0, Math.min(0.999, this.heights[index]));
          const glyphStep = Math.floor(charge * GLYPH_COUNT);
          const tint = Math.max(0, Math.min(1, (charge - 0.15) / 0.7));
          const tintLevel = Math.round(tint * tint * (3 - 2 * tint) * (TINT_LEVELS - 1));
          const key = (level * GLYPH_COUNT + glyphStep) * TINT_LEVELS + tintLevel;
          if (key === this.paintKeys[index]) continue;
          this.paintKeys[index] = key;
          this.dirtyCells[dirtyCount++] = index;
        }
        if (!dirtyCount && !this.fullRedraw) return;

        const paths: (Path2D | undefined)[] = new Array(GLYPH_COUNT * TINT_LEVELS);
        const placement = new DOMMatrix();
        this.context.globalAlpha = 1;
        this.context.fillStyle = this.background;
        if (this.fullRedraw) this.context.fillRect(0, 0, this.width, this.height);
        else this.context.beginPath();
        for (let dirty = 0; dirty < dirtyCount; dirty++) {
          const index = this.dirtyCells[dirty];
          const x = this.cellX[index];
          const y = this.cellY[index];
          const key = this.paintKeys[index];
          const level = Math.floor(key / (GLYPH_COUNT * TINT_LEVELS));
          const glyphStep = Math.floor(key / TINT_LEVELS) % GLYPH_COUNT;
          const tintLevel = key % TINT_LEVELS;
          const glyph = (Math.floor(level / (LEVELS / GLYPH_COUNT)) + glyphStep) % GLYPH_COUNT;
          // The 14px tile clears the glyph and its cell-local glow without
          // touching a neighbor on the >=24px grid.
          if (!this.fullRedraw) this.context.rect(x - 7, y - 7, 14, 14);
          const group = glyph * TINT_LEVELS + tintLevel;
          const path = paths[group] ??= new Path2D();
          placement.e = x;
          placement.f = y;
          path.addPath(this.glyphPaths[level * GLYPH_COUNT + glyph], placement);
        }
        if (!this.fullRedraw) this.context.fill();
        this.fullRedraw = false;
        if (this.glowSprite) {
          for (let dirty = 0; dirty < dirtyCount; dirty++) {
            const index = this.dirtyCells[dirty];
            const tintLevel = this.paintKeys[index] % TINT_LEVELS;
            if (!tintLevel) continue;
            this.context.globalAlpha = tintLevel / (TINT_LEVELS - 1);
            this.context.drawImage(this.glowSprite, this.cellX[index] - 7, this.cellY[index] - 7, 14, 14);
          }
        }
        this.context.lineWidth = TERMINAL_GLYPH_STROKE;
        this.context.lineCap = 'round';
        this.context.lineJoin = 'round';
        for (let index = 0; index < paths.length; index++) {
          const path = paths[index];
          if (!path) continue;
          this.context.strokeStyle = this.hoverColors[index % TINT_LEVELS];
          const baseAlpha = terminalGlyphOpacity(Math.floor(index / TINT_LEVELS));
          this.context.globalAlpha = baseAlpha + (1 - baseAlpha) * (index % TINT_LEVELS) / (TINT_LEVELS - 1);
          this.context.stroke(path);
        }
        this.context.globalAlpha = 1;
        if (this.dataset.renderer !== 'canvas') this.dataset.renderer = 'canvas';
      } catch {
        this.fail();
      }
    }

    private tick = (now: number) => {
      this.frame = 0;
      if (this.failed || !this.isConnected || this.motionState() !== 'running') {
        this.syncMotion();
        return;
      }
      if (!this.lastFrame || now - this.lastFrame >= FRAME_INTERVAL) {
        if (this.lastFrame) {
          const delta = Math.min((now - this.lastFrame) / 1000, 0.1);
          this.time += delta;
          this.updateRipples(delta);
        }
        this.lastFrame = now;
        this.draw();
      }
      if (!this.failed) this.frame = requestAnimationFrame(this.tick);
    };
  }

  customElements.define('lomi-shape-waves', ShapeWaves);
}
