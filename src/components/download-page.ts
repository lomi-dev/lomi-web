import {
  downloadPlatforms, fetchLatestRelease, findPackage, releaseFallback,
  type PlatformId, type Release,
} from '../lib/downloads';

type NavigatorHints = {
  platform?: string;
  mobile?: boolean;
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
};

function platformId(value: string | undefined): PlatformId | null {
  return downloadPlatforms.find((platform) => platform.id === value)?.id ?? null;
}

function detectedPlatform(hints?: NavigatorHints): PlatformId {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = (hints?.platform || navigator.platform || userAgent).toLowerCase();
  if (hints?.mobile || /android|iphone|ipad|ipod|mobile/.test(userAgent)
    || (platform.includes('mac') && navigator.maxTouchPoints > 1)) return 'macos';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux') || platform.includes('x11')) return 'linux';
  return 'macos';
}

export function initDownloadPage(root: HTMLElement): void {
  if (root.dataset.downloadReady === 'true') return;
  const tabs = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-platform-tabs] [data-platform]'));
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-platform-panel]'));
  const nav = root.querySelector<HTMLElement>('[data-platform-tabs]');
  const globalStatus = root.querySelector<HTMLElement>('[data-release-status]');
  const retry = root.querySelector<HTMLButtonElement>('[data-release-retry]');
  const hints = (navigator as Navigator & { userAgentData?: NavigatorHints }).userAgentData;
  const explicitPlatform = platformId(location.hash.slice(1));
  let active = explicitPlatform ?? detectedPlatform(hints);
  let interacted = false;
  let release: Release | null = null;
  let state: 'loading' | 'ready' | 'error' = 'loading';
  let request = 0;
  let controller: AbortController | null = null;

  function updatePackages(announcePlatform?: PlatformId): void {
    for (const panel of panels) {
      const platform = platformId(panel.dataset.platformPanel);
      if (!platform) continue;
      const checked = panel.querySelector<HTMLInputElement>('input[type="radio"]:checked');
      const option = downloadPlatforms.find((entry) => entry.id === platform)?.packages.find((entry) => entry.id === checked?.value);
      const asset = option ? findPackage(release, platform, option.id) : null;
      const action = panel.querySelector<HTMLAnchorElement>('[data-download-action]');
      const label = panel.querySelector<HTMLElement>('[data-action-label]');
      const status = panel.querySelector<HTMLElement>('[data-package-status]');
      panel.dataset.packageAvailable = String(Boolean(asset));
      if (action) action.href = asset?.url ?? release?.url ?? releaseFallback;
      if (label) label.textContent = asset
        ? `Download for ${downloadPlatforms.find((entry) => entry.id === platform)?.label ?? platform}`
        : 'View releases on GitHub';
      if (status) {
        // Fetch results use the shared live region. Announce a package's own
        // availability only when the user changes that package selection.
        status.setAttribute('aria-live', platform === active && platform === announcePlatform ? 'polite' : 'off');
        status.textContent = state === 'loading'
          ? ''
          : state === 'error'
            ? 'We couldn’t check package availability. Browse releases on GitHub.'
            : asset
              ? `${option?.label ?? 'This package'} is ready to download.`
              : `${option?.label ?? 'This package'} is not in the latest release. Browse its files on GitHub.`;
      }
    }
  }

  function activate(platform: PlatformId, updateHash = false): void {
    active = platform;
    root.dataset.platform = platform;
    for (const tab of tabs) {
      const selected = tab.dataset.platform === platform;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) panel.hidden = panel.dataset.platformPanel !== platform;
    if (updateHash) history.replaceState(history.state, '', `#${platform}`);
    updatePackages();
  }

  nav?.setAttribute('role', 'tablist');
  nav?.setAttribute('aria-label', 'Operating system');
  for (const tab of tabs) {
    const platform = platformId(tab.dataset.platform);
    if (!platform) continue;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', platform);
    tab.addEventListener('click', (event) => {
      // Preserve browser shortcuts for opening the ordinary anchor elsewhere.
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      interacted = true;
      activate(platform, true);
    });
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      interacted = true;
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      for (const item of tabs) item.tabIndex = item === tabs[next] ? 0 : -1;
      tabs[next]?.focus();
    });
    // Anchors activate with Enter natively; tabs also activate with Space.
    tab.addEventListener('keydown', (event) => {
      if (event.key !== ' ') return;
      event.preventDefault();
      interacted = true;
      activate(platform, true);
    });
  }
  for (const panel of panels) {
    const platform = platformId(panel.dataset.platformPanel);
    if (!platform) continue;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `tab-${platform}`);
    for (const fieldset of panel.querySelectorAll<HTMLFieldSetElement>('[data-package-options]')) fieldset.disabled = false;
    const radios = Array.from(panel.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    if (!radios.some((radio) => radio.checked) && radios[0]) radios[0].checked = true;
    for (const radio of radios) {
      // Clicking an already-selected option is still an explicit choice and
      // must win over architecture hints that resolve afterward.
      radio.addEventListener('click', () => { interacted = true; });
      radio.addEventListener('keydown', (event) => {
        if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) interacted = true;
      });
      radio.addEventListener('change', () => {
        interacted = true;
        updatePackages(platform);
      });
    }
  }
  window.addEventListener('hashchange', () => {
    const platform = platformId(location.hash.slice(1));
    if (!platform) return;
    interacted = true;
    activate(platform);
  });
  activate(active);
  root.dataset.downloadReady = 'true';

  // Architecture hints refine the default only while the user has made no
  // explicit choice. Safari's MacIntel string cannot identify the actual chip.
  if (!explicitPlatform && active === 'macos' && hints?.getHighEntropyValues) {
    void Promise.resolve().then(() => hints.getHighEntropyValues!(['architecture'])).then(({ architecture }) => {
      if (interacted || active !== 'macos' || !/^(x86|x86_64|x64|ia32|i386)$/i.test(architecture ?? '')) return;
      const intel = root.querySelector<HTMLInputElement>('[data-platform-panel="macos"] input[value="intel"]');
      if (intel) intel.checked = true;
      updatePackages();
    }).catch(() => { /* Keep the visible default when hints are unavailable. */ });
  }

  async function loadRelease(isRetry = false): Promise<void> {
    const current = ++request;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    state = 'loading';
    release = null;
    root.dataset.releaseState = state;
    if (retry) {
      retry.hidden = !isRetry;
      // ARIA disabling keeps keyboard focus on the pending retry. The click
      // handler guards activation while the current request is in progress.
      retry.setAttribute('aria-disabled', 'true');
      retry.setAttribute('aria-busy', 'true');
    }
    if (globalStatus) globalStatus.textContent = '';
    updatePackages();
    try {
      const loaded = await Promise.race([
        fetchLatestRelease(signal),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            if (current === request) controller?.abort();
            reject(new Error('Release request timed out'));
          }, 10_000);
        }),
      ]);
      if (current !== request) return;
      release = loaded;
      state = 'ready';
      if (globalStatus) globalStatus.textContent = `Latest release ${release.tag} is ready.`;
    } catch {
      if (current !== request) return;
      state = 'error';
      if (globalStatus) globalStatus.textContent = 'We couldn’t check the latest release. You can still browse releases on GitHub.';
    } finally {
      clearTimeout(timeout);
      if (current === request) {
        root.dataset.releaseState = state;
        updatePackages();
        if (retry) {
          retry.removeAttribute('aria-disabled');
          retry.removeAttribute('aria-busy');
          if (state === 'ready' && document.activeElement === retry) {
            const action = panels.find((panel) => panel.dataset.platformPanel === active)
              ?.querySelector<HTMLAnchorElement>('[data-download-action]');
            const target = action ?? tabs.find((tab) => tab.dataset.platform === active);
            target?.focus({ preventScroll: true });
          }
          retry.hidden = state !== 'error';
        }
      }
    }
  }
  retry?.addEventListener('click', () => {
    if (state !== 'loading') void loadRelease(true);
  });
  void loadRelease();

  const copyButton = root.querySelector<HTMLButtonElement>('[data-copy-aur]');
  const copyLabel = copyButton?.querySelector<HTMLElement>('[data-copy-label]');
  const copyStatus = root.querySelector<HTMLElement>('[data-copy-status]');
  const command = document.getElementById('aur-command');
  if (copyButton && command) {
    copyButton.hidden = false;
    const originalLabel = copyLabel?.textContent || 'Copy command';
    let copyRequest = 0;
    let reset: ReturnType<typeof setTimeout> | undefined;
    copyButton.addEventListener('click', async () => {
      const current = ++copyRequest;
      clearTimeout(reset);
      if (copyLabel) copyLabel.textContent = originalLabel;
      if (copyStatus) copyStatus.textContent = '';
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable');
        await navigator.clipboard.writeText(command.textContent?.trim() ?? '');
        if (current !== copyRequest) return;
        if (copyLabel) copyLabel.textContent = 'Copied';
        if (copyStatus) copyStatus.textContent = 'Command copied.';
        reset = setTimeout(() => {
          if (copyLabel) copyLabel.textContent = originalLabel;
          if (copyStatus) copyStatus.textContent = '';
        }, 2_000);
      } catch {
        if (current !== copyRequest) return;
        if (copyStatus) copyStatus.textContent = 'Couldn’t copy the command. Select the code and copy it manually.';
      }
    });
  }
}
