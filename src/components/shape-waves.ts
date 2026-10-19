/**
 * Authored Canvas 2D interpretation of React Bits' Shape Waves visual concept.
 * https://reactbits.dev/backgrounds/shape-waves
 * No upstream shader, noise implementation, or runtime code is copied.
 */
const PITCH = 16;
const MAX_CELLS = 7000;
const FRAME_INTERVAL = 1000 / 30;
const TAU = Math.PI * 2;
const LEVELS = 18;

const fieldLevel = (x: number, y: number, time: number) => Math.floor(sampleField(x, y, time) * LEVELS);
const levelRadius = (level: number) => 3.2 + level / (LEVELS - 1) * 0.8;

type Cell = { x: number; y: number; radius: number; shape: number };

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
      visit({ x, y, radius: levelRadius(level), shape: Math.floor(level / (LEVELS / 3)) });
    }
  }
}

/** Three compound paths keep the server-rendered fallback DOM small. */
export function staticShapePaths(width = 1600, height = 1000): string[] {
  const paths = ['', '', ''];
  const number = (value: number) => Number(value.toFixed(1));
  forEachCell(width, height, 0, ({ x, y, radius: r, shape }) => {
    const left = number(x - r);
    const right = number(x + r);
    const top = number(y - r);
    const bottom = number(y + r);
    if (shape === 0) {
      paths[shape] += `M${number(x)} ${top}L${right} ${bottom}H${left}Z`;
    } else if (shape === 1) {
      paths[shape] += `M${right} ${number(y)}A${number(r)} ${number(r)} 0 1 0 ${left} ${number(y)}A${number(r)} ${number(r)} 0 1 0 ${right} ${number(y)}Z`;
    } else {
      paths[shape] += `M${left} ${top}H${right}V${bottom}H${left}Z`;
    }
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
    private frame = 0;
    private lastFrame = 0;
    private time = 0;
    private width = 0;
    private height = 0;
    private visible = false;
    private failed = false;
    private color = '#4f633a';
    private cellX = new Float64Array(0);
    private cellY = new Float64Array(0);
    private levels = new Int8Array(0);
    private dirtyCells = new Uint16Array(0);
    private fullRedraw = true;

    connectedCallback() {
      this.canvas = this.querySelector('canvas');
      this.failed = false;
      // Reconnection must present the current field even while paused.
      this.width = 0;
      this.height = 0;
      this.dataset.renderer = 'fallback';
      try {
        this.context = this.canvas?.getContext('2d', { alpha: false }) ?? null;
        if (!this.context || typeof Path2D === 'undefined') return this.fail();
        this.preference = matchMedia('(prefers-reduced-motion: reduce)');
        const bounds = this.getBoundingClientRect();
        this.visible = bounds.bottom > 0 && bounds.top < innerHeight && bounds.right > 0 && bounds.left < innerWidth;
        this.color = getComputedStyle(this).getPropertyValue('--shape-waves-color').trim() || '#4f633a';
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
      if (state !== 'running') this.stop();
      else if (!this.frame && this.width && this.height) this.frame = requestAnimationFrame(this.tick);
    };

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
      // Grid allocation and coordinate generation happen only on resize.
      const cells: Cell[] = [];
      forEachCell(width, height, this.time, (cell) => cells.push(cell));
      this.cellX = Float64Array.from(cells, (cell) => cell.x);
      this.cellY = Float64Array.from(cells, (cell) => cell.y);
      this.levels = new Int8Array(cells.length).fill(-1);
      this.dirtyCells = new Uint16Array(cells.length);
      this.fullRedraw = true;
      // Resize always draws once, including while paused or offscreen.
      this.draw();
      this.syncMotion();
    };

    private draw() {
      if (!this.context || !this.width || !this.height) return;
      try {
        let dirtyCount = 0;
        for (let index = 0; index < this.levels.length; index++) {
          const level = fieldLevel(this.cellX[index], this.cellY[index], this.time);
          if (level === this.levels[index]) continue;
          this.levels[index] = level;
          this.dirtyCells[dirtyCount++] = index;
        }
        if (!dirtyCount && !this.fullRedraw) return;

        const paths = [new Path2D(), new Path2D(), new Path2D()];
        this.context.globalAlpha = 1;
        this.context.fillStyle = '#0b0e0b';
        if (this.fullRedraw) this.context.fillRect(0, 0, this.width, this.height);
        else this.context.beginPath();
        for (let dirty = 0; dirty < dirtyCount; dirty++) {
          const index = this.dirtyCells[dirty];
          const x = this.cellX[index];
          const y = this.cellY[index];
          const level = this.levels[index];
          const r = levelRadius(level);
          const shape = Math.floor(level / (LEVELS / 3));
          // The 10px clearing box includes the previous glyph's antialiasing
          // fringe and cannot touch a neighbor on the >=16px grid.
          if (!this.fullRedraw) this.context.rect(x - 5, y - 5, 10, 10);
          const path = paths[shape];
          if (shape === 0) {
            path.moveTo(x, y - r);
            path.lineTo(x + r, y + r);
            path.lineTo(x - r, y + r);
            path.closePath();
          } else if (shape === 1) {
            path.moveTo(x + r, y);
            path.arc(x, y, r, 0, TAU);
          } else {
            path.rect(x - r, y - r, r * 2, r * 2);
          }
        }
        if (!this.fullRedraw) this.context.fill();
        this.fullRedraw = false;
        this.context.fillStyle = this.color;
        for (let index = 0; index < paths.length; index++) {
          this.context.globalAlpha = 0.62 + index * 0.16;
          this.context.fill(paths[index]);
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
        if (this.lastFrame) this.time += Math.min((now - this.lastFrame) / 1000, 0.1);
        this.lastFrame = now;
        this.draw();
      }
      if (!this.failed) this.frame = requestAnimationFrame(this.tick);
    };
  }

  customElements.define('lomi-shape-waves', ShapeWaves);
}
