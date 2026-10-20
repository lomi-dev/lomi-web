import type { Landing } from '../../content/landing-schema';
import { hasMediaConsent, onConsentChange, requestConsentSettings } from '../lib/consent';

type YouTubePlayer = {
  mute(): void; unMute(): void; isMuted(): boolean; setVolume(value: number): void; getVolume(): number;
  playVideo(): void; pauseVideo(): void; seekTo(seconds: number, ahead: boolean): void;
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number; destroy(): void;
};
type YouTubeEvent = { target: YouTubePlayer; data?: number };
type YouTubeAPI = { Player: new (iframe: HTMLIFrameElement, options: { events: {
  onReady(event: YouTubeEvent): void; onStateChange(event: YouTubeEvent): void;
  onAutoplayBlocked(): void; onError(): void;
} }) => YouTubePlayer };
type MediaAdapter = {
  play(): void | Promise<void>; pause(): void; seek(seconds: number, final: boolean): void;
  time(): number; duration(): number; volume(): number; muted(): boolean;
  setVolume(value: number): void; setMuted(value: boolean): void;
};
type WebkitVideo = HTMLVideoElement & { webkitEnterFullscreen?: () => void; webkitDisplayingFullscreen?: boolean };
type FullscreenSurface = HTMLElement & { webkitRequestFullscreen?: () => void };
type FullscreenDocument = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
const initialized = new WeakSet<HTMLElement>();
const finite = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
export const formatVideoTime = (value: number) => {
  const seconds = Math.floor(finite(value));
  const minutes = Math.floor(seconds / 60);
  return `${minutes >= 60 ? `${Math.floor(minutes / 60)}:` : ''}${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export function initHeroVideo(root: HTMLElement) {
  if (initialized.has(root)) return;
  const surface = root.querySelector<FullscreenSurface>('[data-video-player]');
  const viewport = root.querySelector<HTMLElement>('[data-video-viewport]');
  const mount = root.querySelector<HTMLElement>('[data-video-mount]');
  const poster = root.querySelector<HTMLAnchorElement>('[data-video-poster]');
  const toggle = root.querySelector<HTMLButtonElement>('[data-player-toggle]');
  const mute = root.querySelector<HTMLButtonElement>('[data-player-mute]');
  const seek = root.querySelector<HTMLInputElement>('[data-player-seek]');
  const volume = root.querySelector<HTMLInputElement>('[data-player-volume]');
  const fullscreen = root.querySelector<HTMLButtonElement>('[data-player-fullscreen]');
  const retry = root.querySelector<HTMLButtonElement>('[data-player-retry]');
  const currentTime = root.querySelector<HTMLElement>('[data-player-current]');
  const durationTime = root.querySelector<HTMLElement>('[data-player-duration]');
  const controls = root.querySelector<HTMLElement>('[data-player-controls]');
  const gestures = root.querySelector<HTMLButtonElement>('[data-player-surface-toggle]');
  if (!surface || !viewport || !mount || !poster || !toggle || !mute || !seek || !volume || !fullscreen || !retry || !currentTime || !durationTime || !controls || !gestures) return;
  const copy = JSON.parse(root.dataset.videoCopy ?? '{}') as Landing['hero']['player'];
  const announcement = root.querySelector<HTMLElement>('[data-video-announcement]');
  const video = root.querySelector<WebkitVideo>('[data-native-video]');
  const isYouTube = !video;
  const youtube = window as Window & { YT?: YouTubeAPI; onYouTubeIframeAPIReady?: () => void };
  const fullscreenDoc = document as FullscreenDocument;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let adapter: MediaAdapter | null = null;
  let active: YouTubePlayer | null = null;
  let version = 0;
  let ready = false;
  let pending = false;
  let playing = false;
  let awaitingPlay = false;
  let pauseRequested = false;
  let visible = false;
  let inView = false;
  let autoStarted = false;
  let requestedPlay = false;
  let userPaused = false;
  let pageActive = true;
  let scrubbing = false;
  let scrubPaused = false;
  let lastVolume = 70;
  let tick = 0;
  let timeout = 0;
  let durationPolls = 0;
  let playRequest = 0;
  let apiScript: HTMLScriptElement | null = null;
  let cancelAPI: (() => void) | null = null;
  let idleTimer = 0;
  let hoveringControls = false;
  let inputMode: 'keyboard' | 'pointer' | null = null;
  let wakeOnly = false;
  const heldPointers = new Set<number>();

  function keyboardFocus() {
    const focused = document.activeElement;
    return focused instanceof HTMLElement && (controls!.contains(focused) || focused === gestures)
      && (inputMode === 'keyboard' || inputMode === null && focused.matches(':focus-visible'));
  }

  function canHideControls() {
    return pageActive && !document.hidden && root.hasAttribute('data-video-frame')
      && ['ready', 'playing', 'paused'].includes(root.dataset.videoStatus ?? '')
      && !hoveringControls && !heldPointers.size && !scrubbing && !keyboardFocus();
  }

  function scheduleControls() {
    clearTimeout(idleTimer);
    if (!canHideControls()) return;
    idleTimer = window.setTimeout(() => {
      if (canHideControls()) root.dataset.controlsVisible = 'false';
    }, 2000);
  }

  function revealControls() {
    root.dataset.controlsVisible = 'true';
    scheduleControls();
  }

  function status(value: string, text = '') {
    root.dataset.videoStatus = value;
    document.dispatchEvent(new Event('lomi:media-surface-change'));
    surface!.setAttribute('aria-busy', String(value === 'loading'));
    if (announcement && text) announcement.textContent = text;
    refresh();
    revealControls();
  }

  function frame() {
    root.dataset.videoFrame = '';
    document.dispatchEvent(new Event('lomi:media-surface-change'));
    if (document.activeElement === poster) toggle!.focus({ preventScroll: true });
    revealControls();
  }

  function showTime(seconds: number, duration: number) {
    const time = formatVideoTime(seconds);
    const total = formatVideoTime(duration);
    currentTime!.textContent = time;
    durationTime!.textContent = total;
    seek!.setAttribute('aria-valuetext', copy.timeLabel.replaceAll('{current}', time).replaceAll('{duration}', total));
    seek!.style.setProperty('--progress', `${duration ? Math.min(100, seconds / duration * 100) : 0}%`);
  }

  function syncFullscreen() {
    const full = fullscreenDoc.fullscreenElement === surface || fullscreenDoc.webkitFullscreenElement === surface || !!video?.webkitDisplayingFullscreen;
    fullscreen!.dataset.active = String(full);
    fullscreen!.setAttribute('aria-label', full ? copy.exitFullscreenLabel : copy.fullscreenLabel);
    fullscreen!.title = full ? copy.exitFullscreenLabel : copy.fullscreenLabel;
  }

  function refresh() {
    clearTimeout(tick);
    const duration = adapter ? finite(adapter.duration()) : 0;
    const seconds = adapter ? finite(adapter.time()) : 0;
    const muted = !adapter || adapter.muted() || adapter.volume() <= 0;
    const level = muted ? 0 : Math.max(0, Math.min(100, adapter!.volume()));
    if (level > 0) lastVolume = level;
    const ended = root.dataset.videoStatus === 'ended';
    toggle!.dataset.state = ended ? 'replay' : playing || awaitingPlay ? 'pause' : 'play';
    toggle!.setAttribute('aria-label', ended ? copy.replayLabel : playing || awaitingPlay ? copy.pauseLabel : copy.playLabel);
    toggle!.title = toggle!.getAttribute('aria-label')!;
    gestures!.setAttribute('aria-label', toggle!.getAttribute('aria-label')!);
    toggle!.disabled = pending;
    mute!.dataset.muted = String(muted);
    mute!.setAttribute('aria-label', muted ? copy.unmuteLabel : copy.muteLabel);
    mute!.title = muted ? copy.unmuteLabel : copy.muteLabel;
    mute!.disabled = volume!.disabled = !ready;
    volume!.value = String(Math.round(level));
    volume!.style.setProperty('--progress', `${level}%`);
    volume!.setAttribute('aria-valuetext', `${Math.round(level)}%`);
    seek!.disabled = !ready || !duration;
    seek!.max = String(duration || 1);
    if (!scrubbing) { seek!.value = String(Math.min(seconds, duration || seconds)); showTime(seconds, duration); }
    fullscreen!.disabled = !ready;
    retry!.hidden = root.dataset.videoStatus !== 'error';
    syncFullscreen();
    if (isYouTube && ready && inView && !document.hidden && (playing || root.dataset.videoStatus === 'loading' || !duration && durationPolls < 24)) {
      tick = window.setTimeout(() => { durationPolls++; refresh(); }, 250);
    }
  }

  const current = (session: number) => pageActive && session === version && hasMediaConsent();

  function clearYouTube() {
    version++;
    playRequest++;
    cancelAPI?.();
    clearTimeout(timeout);
    clearTimeout(tick);
    clearTimeout(idleTimer);
    root.dataset.controlsVisible = 'true';
    pending = ready = playing = autoStarted = scrubbing = false;
    awaitingPlay = pauseRequested = false;
    durationPolls = 0;
    adapter = null;
    const previous = active;
    active = null;
    try { previous?.destroy(); } catch { /* Removing the frame also stops playback. */ }
    mount!.replaceChildren();
    delete root.dataset.videoMounted;
    delete root.dataset.videoFrame;
  }

  function exitFullscreen() {
    if (fullscreenDoc.fullscreenElement === surface) void fullscreenDoc.exitFullscreen().catch(() => {});
    else if (fullscreenDoc.webkitFullscreenElement === surface) fullscreenDoc.webkitExitFullscreen?.();
  }

  function showConsent() {
    const focused = root.contains(document.activeElement);
    clearYouTube();
    apiScript?.remove();
    apiScript = null;
    requestedPlay = false;
    exitFullscreen();
    status('consent');
    poster!.setAttribute('aria-label', copy.privacyLabel);
    if (focused) poster!.focus({ preventScroll: true });
  }

  function loadAPI(session: number): Promise<YouTubeAPI> {
    if (youtube.YT?.Player) return Promise.resolve(youtube.YT);
    return new Promise((resolve, reject) => {
      const previous = youtube.onYouTubeIframeAPIReady;
      const script = document.createElement('script');
      apiScript = script;
      let apiTimeout = 0;
      const cleanup = () => {
        clearTimeout(apiTimeout);
        script.onerror = null;
        cancelAPI = null;
        if (youtube.onYouTubeIframeAPIReady === onReady) youtube.onYouTubeIframeAPIReady = previous;
      };
      const fail = () => { cleanup(); script.remove(); reject(new Error('YouTube API unavailable')); };
      const onReady = () => {
        if (!current(session) || !youtube.YT?.Player) { fail(); return; }
        cleanup(); resolve(youtube.YT); previous?.();
      };
      cancelAPI = fail;
      youtube.onYouTubeIframeAPIReady = onReady;
      script.src = 'https://www.youtube.com/iframe_api';
      script.async = true;
      script.onerror = fail;
      apiTimeout = window.setTimeout(fail, 12000);
      document.head.append(script);
    });
  }

  function pause(manual = false) {
    playRequest++;
    if (manual) userPaused = true;
    awaitingPlay = false;
    pauseRequested = ready && !!adapter;
    requestedPlay = false;
    adapter?.pause();
    playing = false;
    if (ready) status('paused');
  }

  function play(manual = false) {
    if (manual) { userPaused = false; requestedPlay = true; }
    if (isYouTube && !hasMediaConsent()) { requestConsentSettings(poster!); return; }
    if (!adapter || !ready) return;
    if (root.dataset.videoStatus === 'ended') adapter.seek(0, true);
    requestedPlay = false;
    pauseRequested = false;
    awaitingPlay = true;
    autoStarted = true;
    const request = ++playRequest;
    if (!root.hasAttribute('data-video-frame')) status('loading', copy.loadingLabel);
    else refresh();
    const result = adapter.play();
    if (result instanceof Promise) void result.catch(() => {
      if (request !== playRequest) return;
      requestedPlay = false;
      playing = awaitingPlay = false;
      if (pageActive) status('paused', copy.readyLabel);
    });
  }

  function autoplay() {
    if (!ready || !inView || awaitingPlay || playing || document.hidden || !pageActive || document.querySelector('dialog[open]')) return;
    if (requestedPlay) { requestedPlay = false; play(); }
    else if (visible && !autoStarted && !userPaused && !reduced.matches) { autoStarted = true; play(); }
  }

  function failed(session?: number) {
    if (session !== undefined && !current(session)) return;
    if (isYouTube) clearYouTube();
    else { ready = playing = pending = awaitingPlay = false; playRequest++; video?.pause(); delete root.dataset.videoFrame; }
    requestedPlay = false;
    poster!.setAttribute('aria-label', isYouTube ? copy.watchLabel : copy.videoTitle);
    status('error', copy.errorLabel);
  }

  function startYouTube() {
    if (!pageActive || pending || mount!.childElementCount) return;
    if (!hasMediaConsent()) { showConsent(); return; }
    clearYouTube();
    const session = version;
    pending = true;
    status('loading', copy.loadingLabel);
    poster!.setAttribute('aria-label', copy.playLabel);
    void loadAPI(session).then((api) => {
      if (!current(session)) return;
      const iframe = document.createElement('iframe');
      const source = new URL(`https://www.youtube-nocookie.com/embed/${root.dataset.videoId}`);
      source.search = new URLSearchParams({ autoplay: '0', controls: '0', playsinline: '1', enablejsapi: '1', origin: location.origin, fs: '1' }).toString();
      iframe.src = source.href;
      iframe.title = copy.videoTitle;
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      iframe.allowFullscreen = true;
      iframe.referrerPolicy = 'strict-origin-when-cross-origin';
      mount!.replaceChildren(iframe);
      root.dataset.videoMounted = '';
      timeout = window.setTimeout(() => failed(session), 15000);
      const instance = new api.Player(iframe, { events: {
        onReady: ({ target }) => {
          if (!current(session)) return;
          clearTimeout(timeout);
          target.mute();
          active = target;
          adapter = {
            play: () => target.playVideo(), pause: () => target.pauseVideo(), seek: (seconds, final) => target.seekTo(seconds, final),
            time: () => target.getCurrentTime(), duration: () => target.getDuration(), volume: () => target.getVolume(), muted: () => target.isMuted(),
            setVolume: (value) => target.setVolume(value), setMuted: (value) => value ? target.mute() : target.unMute(),
          };
          pending = false; ready = true;
          status('ready', copy.readyLabel);
          autoplay();
        },
        onStateChange: ({ data, target }) => {
          if (!current(session) || !ready) return;
          if (data === 1) {
            autoStarted = true;
            requestedPlay = false;
            if (pauseRequested || !inView || document.hidden || !pageActive || document.querySelector('dialog[open]')) { target.pauseVideo(); playing = awaitingPlay = false; status('paused'); return; }
            awaitingPlay = false; playing = true; frame(); status('playing');
          } else if (data === 2) { playing = awaitingPlay = pauseRequested = false; status('paused'); }
          else if (data === 0) { playing = awaitingPlay = pauseRequested = false; status('ended'); }
          else if (data === 3 && (playing || awaitingPlay)) status('loading');
          else refresh();
        },
        onAutoplayBlocked: () => { if (current(session)) { requestedPlay = false; playing = awaitingPlay = false; status('paused', copy.readyLabel); } },
        onError: () => failed(session),
      } });
      if (current(session)) active = instance;
      else instance.destroy();
    }).catch(() => { if (current(session)) failed(session); });
  }

  if (video) {
    poster.setAttribute('aria-label', copy.playLabel);
    adapter = {
      play: () => video.play(), pause: () => video.pause(), seek: (seconds) => { video.currentTime = seconds; },
      time: () => video.currentTime, duration: () => video.duration, volume: () => video.volume * 100, muted: () => video.muted,
      setVolume: (value) => { video.volume = value / 100; }, setMuted: (value) => { video.muted = value; },
    };
    const metadata = () => { ready = true; pending = false; status('ready', copy.readyLabel); autoplay(); };
    video.addEventListener('loadedmetadata', metadata);
    video.addEventListener('loadeddata', () => { frame(); refresh(); });
    video.addEventListener('playing', () => {
      if (pauseRequested || video.paused || !inView || document.hidden || !pageActive || document.querySelector('dialog[open]')) { pause(); return; }
      autoStarted = true; requestedPlay = false; awaitingPlay = false; playing = true; frame(); status('playing');
    });
    video.addEventListener('pause', () => { playing = awaitingPlay = pauseRequested = false; if (ready && !video.ended) status('paused'); });
    video.addEventListener('ended', () => { playing = awaitingPlay = false; status('ended'); });
    video.addEventListener('waiting', () => { if (!video.paused) status('loading'); });
    // A nested <source> dispatches its own non-bubbling error when it fails.
    video.addEventListener('error', () => failed(), true);
    for (const event of ['timeupdate', 'durationchange', 'volumechange', 'seeked']) video.addEventListener(event, refresh);
    video.addEventListener('seeked', () => { if (root.dataset.videoStatus === 'ended' && !video.ended) status('paused'); });
    video.addEventListener('webkitbeginfullscreen', () => { syncFullscreen(); revealControls(); });
    video.addEventListener('webkitendfullscreen', () => { syncFullscreen(); revealControls(); });
    video.controls = false;
    if (video.error || video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) failed();
    else if (video.readyState >= 1) metadata();
    else status('loading', copy.loadingLabel);
    if (video.readyState >= 2) frame();
  }

  function togglePlayback() {
    if (root.dataset.videoStatus === 'error') { retry!.click(); return; }
    if (playing || awaitingPlay) pause(true);
    else play(true);
  }
  toggle.addEventListener('click', togglePlayback);
  gestures.addEventListener('click', (event) => {
    // Captured pointers can end over provider links outside the central button.
    const bounds = gestures.getBoundingClientRect();
    if (event.detail && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) return;
    revealControls();
    if (wakeOnly) { wakeOnly = false; return; }
    togglePlayback();
  });
  poster.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || root.dataset.videoStatus === 'error') return;
    event.preventDefault(); togglePlayback();
  });
  mute.addEventListener('click', () => {
    if (!adapter || !ready) return;
    const unmute = adapter.muted() || adapter.volume() <= 0;
    if (unmute && adapter.volume() <= 0) adapter.setVolume(lastVolume);
    adapter.setMuted(!unmute);
    refresh();
  });
  volume.addEventListener('input', () => {
    if (!adapter || !ready) return;
    const value = Math.max(0, Math.min(100, Number(volume.value)));
    adapter.setVolume(value); adapter.setMuted(value === 0); refresh(); revealControls();
  });
  seek.addEventListener('input', () => {
    if (!adapter || !ready || seek.disabled) return;
    if (!scrubbing) scrubPaused = !(playing || awaitingPlay);
    scrubbing = true;
    revealControls();
    if (root.dataset.videoStatus === 'ended') status('paused');
    const duration = finite(adapter.duration());
    const value = Math.max(0, Math.min(duration, Number(seek.value)));
    showTime(value, duration); adapter.seek(value, false);
    if (scrubPaused) pause(true);
  });
  seek.addEventListener('change', () => {
    if (!adapter || !ready || seek.disabled) return;
    const value = Math.max(0, Math.min(finite(adapter.duration()), Number(seek.value)));
    if (root.dataset.videoStatus === 'ended') { scrubPaused = true; status('paused'); }
    adapter.seek(value, true);
    if (scrubPaused) pause(true);
    scrubbing = false; refresh(); scheduleControls();
  });
  seek.addEventListener('blur', () => { if (scrubbing) { scrubbing = false; refresh(); scheduleControls(); } });
  fullscreen.hidden = !surface.requestFullscreen && !surface.webkitRequestFullscreen && !video?.webkitEnterFullscreen;
  fullscreen.addEventListener('click', () => {
    if (!ready) return;
    if (fullscreenDoc.fullscreenElement === surface || fullscreenDoc.webkitFullscreenElement === surface) { exitFullscreen(); return; }
    try {
      if (surface.requestFullscreen) void surface.requestFullscreen().catch(() => { if (announcement) announcement.textContent = copy.errorLabel; });
      else if (surface.webkitRequestFullscreen) surface.webkitRequestFullscreen();
      else video?.webkitEnterFullscreen?.();
    } catch { if (announcement) announcement.textContent = copy.errorLabel; }
  });
  document.addEventListener('fullscreenchange', () => { syncFullscreen(); revealControls(); });
  document.addEventListener('webkitfullscreenchange', () => { syncFullscreen(); revealControls(); });
  retry.addEventListener('click', () => {
    playRequest++;
    userPaused = false; requestedPlay = true;
    if (isYouTube) startYouTube();
    else { ready = false; delete root.dataset.videoFrame; status('loading', copy.loadingLabel); video!.load(); }
  });
  if (typeof IntersectionObserver !== 'undefined') new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting && entry.intersectionRatio > 0;
    visible = entry.isIntersecting && entry.intersectionRatio >= .51;
    if (!inView) pause();
    else { autoplay(); refresh(); }
  }, { threshold: [0, .51] }).observe(viewport);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { heldPointers.clear(); pause(); } else { autoplay(); refresh(); revealControls(); } });
  surface.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      if (!event.buttons) heldPointers.delete(event.pointerId);
      revealControls();
    }
  });
  surface.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') revealControls();
  });
  surface.addEventListener('pointerleave', () => { hoveringControls = false; scheduleControls(); });
  surface.addEventListener('pointerdown', (event) => {
    if (event.target === seek || event.target === volume || event.target instanceof Node && gestures!.contains(event.target)) heldPointers.add(event.pointerId);
    wakeOnly = event.pointerType !== 'mouse' && root.dataset.controlsVisible === 'false'
      && event.target instanceof Node && gestures!.contains(event.target);
    revealControls();
  }, true);
  gestures.addEventListener('pointerdown', (event) => gestures.setPointerCapture(event.pointerId));
  gestures.addEventListener('lostpointercapture', (event) => {
    heldPointers.delete(event.pointerId);
    scheduleControls();
  });
  controls.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') { hoveringControls = true; revealControls(); }
  });
  controls.addEventListener('pointerleave', () => { hoveringControls = false; scheduleControls(); });
  controls.addEventListener('focusin', revealControls);
  controls.addEventListener('focusout', () => queueMicrotask(scheduleControls));
  gestures.addEventListener('focusin', revealControls);
  gestures.addEventListener('focusout', () => queueMicrotask(scheduleControls));
  document.addEventListener('pointerdown', () => { inputMode = 'pointer'; queueMicrotask(scheduleControls); }, true);
  for (const event of ['pointerup', 'pointercancel']) document.addEventListener(event, (event) => {
    if (event.type === 'pointercancel') wakeOnly = false;
    if (heldPointers.delete((event as PointerEvent).pointerId)) scheduleControls();
  }, true);
  document.addEventListener('keydown', (event) => {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
    inputMode = 'keyboard';
    if (root.contains(document.activeElement)) revealControls();
  }, true);
  window.addEventListener('blur', () => { heldPointers.clear(); scheduleControls(); });
  reduced.addEventListener('change', () => { if (reduced.matches) pause(); });
  // Feature dialogs are native top-layer surfaces; do not play behind them.
  document.querySelectorAll('dialog').forEach((dialog) => new MutationObserver(() => {
    if (dialog.open) pause();
  }).observe(dialog, { attributes: true, attributeFilter: ['open'] }));
  window.addEventListener('pagehide', () => { pageActive = false; if (isYouTube) clearYouTube(); else pause(); });
  window.addEventListener('pageshow', () => { pageActive = true; if (isYouTube && hasMediaConsent()) startYouTube(); });
  if (isYouTube) {
    onConsentChange((choice) => { if (choice?.externalMedia) startYouTube(); else showConsent(); });
    if (hasMediaConsent()) startYouTube(); else showConsent();
  }
  initialized.add(root);
  root.dataset.playerReady = '';
  refresh();
  revealControls();
}
