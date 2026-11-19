// Refracted glass: the brand's Aurora (Violet and Signal light on Night) seen through a pane of
// reeded glass. Each rib is a small cylinder lens that shows a mirrored slice of the light behind
// it. A soft light follows the pointer, so the ribs come alive under the cursor.
// One WebGL1 pass, no library. Without WebGL the CSS picture on the container stays.

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

const FRAG = `
precision highp float;
uniform vec2 r;      // canvas px
uniform float dpr;
uniform float t;     // seconds
uniform float k;     // intro 0..1
uniform vec2 m;      // pointer, CSS px, y up
uniform float lit;   // pointer light 0..1
uniform float rib;   // rib width, CSS px
uniform float ctr;   // 1: centred copy on top, light gathers low (like a phone)
uniform float flip;  // 1: copy on the right, light on the left

const vec3 NIGHT = vec3(.055, .055, .067);
const vec3 DEEP = vec3(.298, .106, .749);
const vec3 VIOLET = vec3(.447, .231, .980);
const vec3 LILAC = vec3(.682, .553, 1.0);
const vec3 LIME = vec3(.725, .961, 0.0);

float blob(vec2 p, vec2 c, float s) { vec2 d = (p - c) / s; return exp(-dot(d, d) * 1.6); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

// The light behind the glass, p in height units (0..1 up), a = aspect.
vec3 field(vec2 p, float a) {
  p.x = mix(p.x, a - p.x, flip);
  float s = t * .06;
  // portrait (phones): the copy sits on top, so the light gathers low, behind the window
  float port = max(step(a, 1.), ctr);
  vec3 c = NIGHT;
  c = mix(c, DEEP, .95 * k * blob(p, vec2(a * .5 + .08 * sin(s * 2.1), mix(.38, .18, port) + .1 * cos(s * 1.7)), .44));
  c = mix(c, VIOLET, .95 * k * blob(p, vec2(a * .8 + .08 * cos(s * 1.9), .04 + .1 * sin(s * 2.3)), .42));
  c = mix(c, LIME, .7 * k * blob(p, vec2(a * .9 + .06 * sin(s * 1.5), mix(.78, .36, port) + .06 * cos(s * 2.0)), .17));
  c = mix(c, LILAC, .3 * k * blob(p, vec2(a * .2 + .12 * sin(s * 1.3), -.08), .32));
  // the text side stays calm: the left on wide screens, the top on phones
  float calm = mix(smoothstep(a * .55, a * .08, p.x) * smoothstep(0., .55, p.y), smoothstep(.42, .62, p.y), port);
  c = mix(c, NIGHT, .6 * calm);
  // the pointer light: a lilac glow with a small Signal core, seen through the glass everywhere
  vec2 q = m / r.y * dpr;
  q.x = mix(q.x, a - q.x, flip);
  c = mix(c, LILAC, .55 * lit * blob(p, q, .17));
  c = mix(c, LIME, .4 * lit * blob(p, q, .055));
  return c;
}

void main() {
  vec2 css = gl_FragCoord.xy / dpr;
  vec2 res = r / dpr;
  float a = res.x / res.y;
  float W = rib;
  float u = fract(css.x / W);
  float cu = u - .5;
  // cylinder lens: the bend grows toward each rib's edges
  float slope = cu / sqrt(.3 - cu * cu);
  float bend = -.55 * 4.2 * slope * W;
  vec2 p = vec2(css.x + bend, css.y) / res.y;
  // a slow wave in the glass itself
  p.y += .012 * sin(css.x / W * .7 + t * .2);
  float o = .22 * W / res.y;
  vec3 c = (field(p, a) * 2. + field(p + vec2(o, 0.), a) + field(p - vec2(o, 0.), a)) * .25;

  // light on the ribs: a roll across each rib, a thin line on its lit side, a seam where ribs meet.
  // The ribs show mostly where there is light to bend; the dark text side keeps a faint trace.
  float lum = dot(c, vec3(.3, .55, .15));
  float glow = .25 + .75 * smoothstep(.02, .25, lum);
  float hl = exp(-pow((u - .16) / .05, 2.)) + .35 * exp(-pow((u - .05) / .03, 2.));
  float seam = exp(-pow((1. - u) / .07, 2.)) + .5 * exp(-pow(u / .04, 2.));
  c += (hl * (.012 + .32 * lum) - slope * .008 * (.3 + lum)) * vec3(.94, .94, 1.) * glow;
  c *= 1. - .18 * seam * glow;

  c += (hash(gl_FragCoord.xy + fract(t)) - .5) / 255. * 3.;
  gl_FragColor = vec4(c, 1.);
}`;

export function mountGlass(canvas: HTMLCanvasElement, host: HTMLElement) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
  if (!gl) return;
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const [uR, uDpr, uT, uK, uM, uLit, uRib, uCtr, uFlip] = ['r', 'dpr', 't', 'k', 'm', 'lit', 'rib', 'ctr', 'flip'].map((name) => gl.getUniformLocation(program, name));

  const centred = canvas.dataset.glassCenter !== undefined;
  const mirrored = canvas.dataset.glassMirror !== undefined;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(devicePixelRatio || 1, 1.5);
  const start = performance.now() / 1000;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, lit: 0, target: 0 };
  let w = 0, h = 0, running = false, visible = true, frame = 0;

  const draw = (time: number, intro: number) => {
    gl.uniform2f(uR, canvas.width, canvas.height);
    gl.uniform1f(uDpr, dpr);
    gl.uniform1f(uT, time);
    gl.uniform1f(uK, intro);
    gl.uniform2f(uM, pointer.x, h - pointer.y);
    gl.uniform1f(uLit, pointer.lit);
    gl.uniform1f(uRib, w < 768 ? 32 : 56);
    gl.uniform1f(uCtr, centred ? 1 : 0);
    gl.uniform1f(uFlip, mirrored ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const resize = () => {
    const box = canvas.getBoundingClientRect();
    w = box.width; h = box.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    if (!running) draw(still ? 30 : performance.now() / 1000 - start, 1);
  };

  const tick = () => {
    frame = 0;
    if (!running) return;
    const time = performance.now() / 1000 - start;
    pointer.x += (pointer.tx - pointer.x) * .07;
    pointer.y += (pointer.ty - pointer.y) * .07;
    pointer.lit += (pointer.target - pointer.lit) * .05;
    draw(time, 1 - Math.pow(1 - Math.min(1, time / 1.8), 3));
    frame = requestAnimationFrame(tick);
  };
  const sync = () => {
    const next = visible && !document.hidden && !still;
    if (next === running) return;
    running = next;
    if (running && !frame) frame = requestAnimationFrame(tick);
  };

  host.addEventListener('pointermove', (event) => {
    const box = canvas.getBoundingClientRect();
    pointer.tx = event.clientX - box.left;
    pointer.ty = event.clientY - box.top;
    // the light starts where the pointer enters, not from a corner
    if (!pointer.target && pointer.lit < .01) { pointer.x = pointer.tx; pointer.y = pointer.ty; }
    pointer.target = 1;
  });
  host.addEventListener('pointerleave', () => { pointer.target = 0; });
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }).observe(canvas);
  document.addEventListener('visibilitychange', sync);
  resize();
  sync();
  canvas.dataset.live = '';
}
