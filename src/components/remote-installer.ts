/** Native system choices work without JavaScript; this adds detection and copy. */
export function initRemoteInstaller(root: HTMLElement): void {
  if (root.dataset.remoteReady !== undefined) return;
  root.dataset.remoteReady = '';
  const choices = [...root.querySelectorAll<HTMLInputElement>('input[name="remote-system"]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[data-remote-platform]')];
  const copyButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-copy-remote]')];
  const status = root.querySelector<HTMLElement>('[data-remote-copy-status]');
  if (!choices.length || !status) return;
  let feedbackVersion = 0;
  let copying = false;

  const hint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform;
  const detected = /win/i.test(hint) ? 'windows' : /linux|mac/i.test(hint) ? 'unix' : undefined;
  // Browser-restored form state takes precedence over a platform hint.
  if (!choices.some((choice) => choice.checked !== choice.defaultChecked)) {
    const initial = choices.find((choice) => choice.value === detected);
    if (initial) initial.checked = true;
  }

  const resetFeedback = () => {
    feedbackVersion++;
    status.textContent = copying ? 'Waiting for clipboard…' : '';
    panels.forEach((panel) => {
      panel.querySelector('[data-copy-remote]')?.removeAttribute('data-copied');
      panel.querySelector<HTMLElement>('[data-copy-icon]')!.hidden = false;
      panel.querySelector<HTMLElement>('[data-copied-icon]')!.hidden = true;
      const scroller = panel.querySelector<HTMLElement>('.command-scroll');
      if (scroller) scroller.scrollLeft = 0;
    });
  };
  choices.forEach((choice) => choice.addEventListener('change', resetFeedback));

  panels.forEach((panel) => {
    const button = panel.querySelector<HTMLButtonElement>('[data-copy-remote]');
    const command = panel.querySelector<HTMLElement>('[data-remote-command]');
    if (!button || !command) return;
    button.disabled = false;
    button.addEventListener('click', async () => {
      if (copying) return;
      if (!choices.some((choice) => choice.checked && choice.value === panel.dataset.remotePlatform)) return;
      const version = ++feedbackVersion;
      copying = true;
      // Keep keyboard focus while clipboard permission is pending in Firefox.
      copyButtons.forEach((control) => { control.setAttribute('aria-disabled', 'true'); });
      button.removeAttribute('data-copied');
      panel.querySelector<HTMLElement>('[data-copy-icon]')!.hidden = false;
      panel.querySelector<HTMLElement>('[data-copied-icon]')!.hidden = true;
      status.textContent = 'Waiting for clipboard…';
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(command.textContent ?? '');
        if (version !== feedbackVersion) return;
        button.dataset.copied = '';
        panel.querySelector<HTMLElement>('[data-copy-icon]')!.hidden = true;
        panel.querySelector<HTMLElement>('[data-copied-icon]')!.hidden = false;
        status.textContent = `${panel.dataset.platformLabel} command copied.`;
      } catch {
        if (version !== feedbackVersion) return;
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(command);
        selection?.removeAllRanges();
        selection?.addRange(range);
        status.textContent = 'Couldn’t copy. The command is selected so you can copy it manually.';
      } finally {
        copying = false;
        copyButtons.forEach((control) => { control.removeAttribute('aria-disabled'); });
        if (version !== feedbackVersion) status.textContent = '';
      }
    });
  });
}
