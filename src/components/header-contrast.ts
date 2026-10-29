type RGB = [number, number, number];

const PAPER: RGB = [247, 248, 243];
const weights = [1, 3, 3, 1];
const mix = (from: RGB, to: RGB, amount: number): RGB => from.map((channel, index) => channel + (to[index] - channel) * amount) as RGB;
const luminance = (rgb: RGB) => rgb.reduce((sum, channel, index) => {
  const value = channel / 255;
  return sum + (value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][index];
}, 0);
// Pick crisp black or white ink for each control's local glass backdrop.
// Interpolating between them would pass through unreadable gray text.
export function initHeaderContrast(header: HTMLElement) {
  const targets = [...header.querySelectorAll<HTMLElement>('.wordmark, .product-fallback, .navigation-link, .product-menu > summary, .header-source, .mobile-navigation > summary')];
  const glass = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  let sampleFrame = 0;
  const imagePixels = new WeakMap<HTMLImageElement, { source: string; pixels: ImageData | null }>();

  const menuOpen = () => !!header.querySelector('.product-menu[open], .mobile-navigation[open]');
  const blocked = () => document.hidden || !!document.querySelector('dialog[open]');
  const imageColor = (image: HTMLImageElement, x: number, y: number, base: RGB, geometry: Map<HTMLImageElement, { bounds: DOMRect; style: CSSStyleDeclaration }>): RGB => {
    if (!image.complete || !image.naturalWidth || image.closest('.hero-wallpaper')) return base;
    const source = image.currentSrc || image.src;
    let cached = imagePixels.get(image);
    if (!cached || cached.source !== source) {
      let pixels: ImageData | null = null;
      // Never read cross-origin pixels or change the image's CORS policy.
      if (new URL(source, location.href).origin === location.origin || source.startsWith('data:')) try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 96;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (context) {
          context.drawImage(image, 0, 0, 96, 96);
          pixels = context.getImageData(0, 0, 96, 96);
        }
      } catch { /* Remote or undecodable media retains its section palette. */ }
      cached = { source, pixels };
      imagePixels.set(image, cached);
    }
    if (!cached.pixels) return base;
    let frame = geometry.get(image);
    if (!frame) {
      frame = { bounds: image.getBoundingClientRect(), style: getComputedStyle(image) };
      geometry.set(image, frame);
    }
    const { bounds, style } = frame;
    let width = bounds.width, height = bounds.height;
    if (style.objectFit === 'contain' || style.objectFit === 'cover') {
      const scale = (style.objectFit === 'contain' ? Math.min : Math.max)(width / image.naturalWidth, height / image.naturalHeight);
      width = image.naturalWidth * scale;
      height = image.naturalHeight * scale;
    }
    const position = style.objectPosition.split(' ');
    const offset = (value: string, space: number) => value.endsWith('%') ? parseFloat(value) / 100 * space : parseFloat(value) || 0;
    const u = (x - bounds.left - offset(position[0], bounds.width - width)) / width;
    const v = (y - bounds.top - offset(position[1] ?? '50%', bounds.height - height)) / height;
    if (u < 0 || u >= 1 || v < 0 || v >= 1) return base;
    const index = (Math.floor(v * 96) * 96 + Math.floor(u * 96)) * 4;
    const pixel = cached.pixels.data;
    return mix(base, [pixel[index], pixel[index + 1], pixel[index + 2]], pixel[index + 3] / 255);
  };
  const surfaceColor = (surface: Element, cache: Map<Element, RGB>): RGB => {
    const cached = cache.get(surface);
    if (cached) return cached;
    // Product captures have a dark interface inside their white frames.
    let color: RGB = surface.closest('.deck-frame, .deck-detail') ? [19, 23, 20] : PAPER;
    if (color === PAPER) for (let element: Element | null = surface; element; element = element.parentElement) {
      const background = getComputedStyle(element).backgroundColor;
      const channels = background.match(/[\d.]+/g)?.map(Number);
      if (channels && background.startsWith('color(srgb ')) {
        for (let index = 0; index < 3; index++) channels[index] *= 255;
      }
      if (channels && channels.length >= 3 && (channels[3] ?? 1) >= .95) {
        color = channels.slice(0, 3) as RGB;
        break;
      }
      if (element.matches('.hero')) { color = [255, 255, 255]; break; }
    }
    cache.set(surface, color);
    return color;
  };

  const sample = () => {
    if (sampleFrame) cancelAnimationFrame(sampleFrame);
    sampleFrame = 0;
    header.toggleAttribute('data-scrolled', scrollY > 24);
    if (!glass || blocked()) return;
    if (menuOpen()) {
      const contrast = header.dataset.theme === 'dark' ? 'light' : 'dark';
      for (const element of targets) {
        if (element.dataset.contrast !== contrast) element.dataset.contrast = contrast;
      }
      return;
    }
    const cache = new Map<Element, RGB>();
    const geometry = new Map<HTMLImageElement, { bounds: DOMRect; style: CSSStyleDeclaration }>();
    const surfaceImages = new Map<Element, HTMLImageElement[]>();
    const imageAt = (surface: Element, x: number, y: number) => {
      let images = surfaceImages.get(surface);
      if (!images) {
        // Decorative images can paint the backdrop with pointer-events:none,
        // so native hit testing returns their container instead of the image.
        images = surface instanceof HTMLImageElement ? [surface] : [...surface.querySelectorAll<HTMLImageElement>('img')].reverse();
        surfaceImages.set(surface, images);
      }
      return images.find((image) => {
        if (image.closest('.hero-wallpaper')) return false;
        let frame = geometry.get(image);
        if (!frame) {
          frame = { bounds: image.getBoundingClientRect(), style: getComputedStyle(image) };
          geometry.set(image, frame);
        }
        const { bounds, style } = frame;
        return style.visibility === 'visible' && Number(style.opacity) > 0
          && x >= bounds.left && x < bounds.right && y >= bounds.top && y < bounds.bottom;
      });
    };
    for (const element of targets) {
      const bounds = element.getBoundingClientRect();
      if (!bounds.width || !bounds.height) continue;
      const rgb: RGB = [0, 0, 0];
      // Match the 24px glass blur, including neighboring surfaces at edges.
      for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) {
        const x = Math.max(0, Math.min(innerWidth - 1, bounds.left + bounds.width / 2 + (column * 2 - 3) * 14));
        const y = Math.max(0, Math.min(innerHeight - 1, bounds.top + bounds.height / 2 + (row * 2 - 3) * 14));
        const underlying = document.elementsFromPoint(x, y).find((element) => !header.contains(element));
        let color = underlying ? surfaceColor(underlying, cache) : PAPER;
        const image = underlying && imageAt(underlying, x, y);
        if (image) color = imageColor(image, x, y, color, geometry);
        const weight = weights[row] * weights[column] / 64;
        color.forEach((channel, index) => { rgb[index] += channel * weight; });
      }
      const surface = header.hasAttribute('data-scrolled') ? mix(rgb, [255, 255, 255], .06) : rgb;
      const lightness = luminance(surface);
      const darkContrast = (lightness + .05) / .05;
      const lightContrast = 1.05 / (lightness + .05);
      const previous = element.dataset.contrast;
      // Keep the current ink only while it still meets 4.5:1 to avoid flicker.
      const previousContrast = previous === 'dark' ? darkContrast : previous === 'light' ? lightContrast : 0;
      const contrast = previousContrast >= 4.5 ? previous : darkContrast >= lightContrast ? 'dark' : 'light';
      if (previous !== contrast) element.dataset.contrast = contrast;
    }
  };
  const schedule = () => { if (!sampleFrame) sampleFrame = requestAnimationFrame(sample); };
  sample();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('close', schedule, true);
  document.addEventListener('lomi:media-surface-change', schedule);
  document.addEventListener('load', (event) => { if (event.target instanceof HTMLImageElement) schedule(); }, true);
  header.querySelectorAll('.product-menu, .mobile-navigation').forEach((menu) => menu.addEventListener('toggle', sample));
  document.fonts.ready.then(schedule);
}
