import { getConsent, hasMediaConsent, onConsentChange, saveConsent } from '../lib/consent';

export function initCookieConsent(root: HTMLElement): void {
  if (root.dataset.cookieReady !== undefined) return;
  const banner = root.querySelector<HTMLElement>('[data-cookie-banner]');
  const preferences = root.querySelector<HTMLElement>('#cookie-preferences');
  const compact = root.querySelector<HTMLElement>('[data-cookie-compact]');
  const customize = root.querySelector<HTMLButtonElement>('[data-cookie-customize]');
  const close = root.querySelector<HTMLButtonElement>('[data-cookie-close]');
  const form = root.querySelector<HTMLFormElement>('[data-cookie-form]');
  const media = root.querySelector<HTMLInputElement>('#cookie-external-media');
  const feedback = root.querySelector<HTMLElement>('[data-cookie-feedback]');
  const message = root.querySelector<HTMLElement>('[data-cookie-message]');
  if (!banner || !preferences || !compact || !customize || !close || !form || !media || !feedback || !message) return;
  root.dataset.cookieReady = 'true';
  let expanded = false;
  let returnFocus: HTMLElement | null = null;
  let feedbackTimer = 0;
  let motion: Animation | null = null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function syncChoice() {
    if (!banner || !media) return;
    if (!expanded) {
      banner.hidden = getConsent() !== null;
      media.checked = hasMediaConsent();
    }
  }
  syncChoice();
  onConsentChange(syncChoice);

  function setExpanded(next: boolean) {
    if (!banner || !preferences || !compact || !customize || !close) return;
    const start = banner.getBoundingClientRect().height;
    motion?.cancel();
    motion = null;
    expanded = next;
    banner.hidden = false;
    preferences.hidden = !next;
    compact.hidden = next;
    close.hidden = !next;
    customize.setAttribute('aria-expanded', String(next));
    banner.dataset.expanded = String(next);
    const end = banner.getBoundingClientRect().height;
    if (!reducedMotion.matches && typeof banner.animate === 'function' && start > 0 && Math.abs(end - start) > 1) {
      const active = banner.animate([{ height: `${start}px` }, { height: `${end}px` }], {
        duration: 300, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: 'both',
      });
      motion = active;
      void active.finished.then(() => {
        if (motion !== active) return;
        motion = null;
        active.cancel();
      }).catch(() => { /* A new choice, resize or motion preference interrupted it. */ });
    }
  }

  function openPreferences(trigger?: HTMLElement) {
    if (!banner || !preferences || !media || expanded || document.querySelector('dialog[open]')) return;
    returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    media.checked = hasMediaConsent();
    setExpanded(true);
    preferences.focus({ preventScroll: true });
  }

  function restoreFocus() {
    const target = returnFocus?.isConnected && returnFocus.getClientRects().length ? returnFocus : document.getElementById('main');
    target?.focus({ preventScroll: true });
    returnFocus = null;
  }

  function resetPanel() {
    if (!banner || !preferences || !compact || !customize || !close) return;
    motion?.cancel();
    motion = null;
    expanded = false;
    preferences.hidden = true;
    compact.hidden = false;
    close.hidden = true;
    customize.setAttribute('aria-expanded', 'false');
    banner.dataset.expanded = 'false';
  }

  function closePreferences() {
    if (!banner) return;
    if (getConsent() === null) setExpanded(false);
    else {
      resetPanel();
      banner.hidden = true;
    }
    restoreFocus();
  }

  function saveChoice(allow: boolean) {
    if (!banner) return;
    saveConsent(allow);
    resetPanel();
    banner.hidden = true;
    restoreFocus();
  }
  root.querySelectorAll<HTMLButtonElement>('[data-cookie-reject]').forEach((button) => button.addEventListener('click', () => saveChoice(false)));
  root.querySelector('[data-cookie-accept]')?.addEventListener('click', () => saveChoice(true));
  customize.addEventListener('click', () => openPreferences(customize));
  close.addEventListener('click', closePreferences);
  form.addEventListener('submit', (event) => { event.preventDefault(); saveChoice(media.checked); });
  banner.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    event.stopPropagation();
    closePreferences();
  });
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-cookie-settings]') : null;
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openPreferences(link);
  });
  window.addEventListener('lomi:consent-settings', (event) => {
    openPreferences((event as CustomEvent<{ trigger?: HTMLElement }>).detail?.trigger);
  });
  const cancelMotion = () => { motion?.cancel(); motion = null; };
  window.addEventListener('resize', cancelMotion);
  reducedMotion.addEventListener('change', cancelMotion);

  window.addEventListener('lomi:consent-storage-error', () => {
    clearTimeout(feedbackTimer);
    feedback.hidden = false;
    message.textContent = 'Your choice applies to this visit. Your browser couldn’t save it for next time.';
    feedbackTimer = window.setTimeout(() => { feedback.hidden = true; }, 10000);
  });
  root.querySelector('[data-cookie-message-close]')?.addEventListener('click', () => {
    clearTimeout(feedbackTimer);
    feedback.hidden = true;
  });
}
