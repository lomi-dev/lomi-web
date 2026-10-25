(() => {
  if (window.__lomiFeatureMovieRunner) return;
  window.__lomiFeatureMovieRunner = true;
  const invoke = (...args) => window.__TAURI_INTERNALS__.invoke(...args);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const waitUntil = async (test, timeout = 5000, description = 'UI state') => {
    const deadline = performance.now() + timeout;
    while (performance.now() < deadline) {
      const result = test();
      if (result) return result;
      await sleep(40);
    }
    throw new Error(`Timed out waiting for ${description}`);
  };
  const waitFor = (selector, timeout = 5000) => waitUntil(() => document.querySelector(selector), timeout, selector);
  const setValue = (element, value) => {
    element.focus();
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
    if (!setter) throw new Error('Input has no native value setter');
    setter.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const type = async (element, value, delay = 42) => {
    setValue(element, '');
    for (let index = 1; index <= value.length; index++) { setValue(element, value.slice(0, index)); await sleep(delay); }
  };
  const click = (element) => {
    if (!element) throw new Error('Requested UI control was not found');
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    element.click();
  };
  const key = (target, value, { primary = false, shift = false } = {}) => {
    target.focus();
    const mac = navigator.platform.startsWith('Mac');
    const options = { key: value, code: value.length === 1 ? `Key${value.toUpperCase()}` : value,
      metaKey: primary && mac, ctrlKey: primary && !mac, shiftKey: shift, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent('keydown', options));
    target.dispatchEvent(new KeyboardEvent('keyup', options));
  };
  const panes = () => [...document.querySelectorAll('.terminal-pane[data-pane-id]')].filter((pane) => pane.offsetWidth && pane.offsetHeight && !pane.closest('[hidden]'));
  const currentPane = () => document.activeElement?.closest?.('.terminal-pane[data-pane-id]') ?? panes().at(-1);
  const newTab = async (label) => {
    click(await waitFor('.tab-bar button.icon-button[aria-haspopup="menu"]'));
    const button = await waitUntil(() => [...document.querySelectorAll('[role="menu"][aria-label="New tab"] button')].find((button) => button.textContent.trim() === label), 3000, label);
    click(button);
  };

  async function capture() {
    const control = () => invoke('plugin_smoke_result', { stage: 'feature-movie-control', data: null });
    let options = await control();
    await waitFor('.app-shell .tab-bar', 20_000);
    await waitFor('.terminal-pane .xterm-helper-textarea', 20_000);
    if (options.scene === 'panels') await waitFor('.workspace-list [data-workspace-id]', 20_000);
    else if (options.scene === 'git') await waitFor('button[aria-label="View diff for src/useWorkspaceFilter.ts"]', 20_000);
    else await waitFor('.tree-row', 20_000);

    // Install and prepare every scene before the recorder is allowed to start.
    window.dispatchEvent(new CustomEvent('lomi-feature-movie-enable', { detail: options }));
    const feature = await waitUntil(() => window.__lomiFeatureMovie, 4000, 'native capture helper');
    const firstPane = currentPane();
    if (!firstPane) throw new Error('Initial terminal is unavailable');
    await waitUntil(() => feature.terminalStatus(firstPane.dataset.paneId) === 'running', 10_000, 'running terminal');
    feature.terminalInput(firstPane.dataset.paneId, "export PS1='release-workspace › '; clear\r");
    await sleep(700);
    let browserId;
    if (options.scene === 'code') {
      click(await waitUntil(() => [...document.querySelectorAll('.tab-bar button[role="tab"]')].find((tab) => tab.textContent.includes('useWorkspaceFilter.ts')), 5000, 'source file tab'));
      await waitFor('.cm-content .cm-line');
    } else if (options.scene === 'expand') {
      await newTab('New browser');
      const address = await waitFor('input[aria-label="Web address"]');
      setValue(address, options.browserUrl);
      await sleep(60);
      address.closest('form').requestSubmit();
      const browser = await waitFor('.browser-pane[data-browser-pane-id]');
      browserId = browser.dataset.browserPaneId;
      await sleep(1600);
    } else if (options.scene === 'git') {
      click(await waitFor('button[aria-label="View diff for src/useWorkspaceFilter.ts"]'));
      await sleep(600);
    } else if (options.scene === 'spark') {
      await feature.api('chat_probe_backend');
      await newTab('Chat AI');
      await waitFor('.chat-pane[data-chat-pane-id]');
      await feature.prepareChatFixture();
      await waitFor('textarea[data-chat-input]');
    }
    await sleep(350);
    await invoke('plugin_smoke_result', { stage: 'feature-movie-ready', data: null });
    for (let attempt = 0; attempt < 600; attempt++) {
      options = await control();
      if (options.started) break;
      await sleep(30);
    }
    if (!options.started) throw new Error('Capture start signal timed out');
    const started = performance.now();
    const at = async (seconds) => sleep(Math.max(0, seconds * 1000 - (performance.now() - started)));
    const cues = [];
    window.setTimeout(() => { void invoke('plugin_smoke_result', { stage: 'feature-movie-exit', data: null }); }, 10_800);
    const cue = async (name, selector, action) => {
      const element = await waitFor(selector, 2500);
      const bounds = element.getBoundingClientRect();
      cues.push({ name, target: selector, action, at: Number(((performance.now() - started) / 1000).toFixed(3)),
        focus: { x: (bounds.left + bounds.width / 2) / innerWidth, y: (bounds.top + bounds.height / 2) / innerHeight },
        bounds: { x: bounds.x / innerWidth, y: bounds.y / innerHeight, width: bounds.width / innerWidth, height: bounds.height / innerHeight },
        viewport: { width: innerWidth, height: innerHeight } });
      await invoke('plugin_smoke_result', { stage: 'feature-movie-progress', data: { scene: options.scene, cues } });
      return element;
    };
    const terminalType = async (pane, value) => {
      for (const character of value) { feature.terminalInput(pane.dataset.paneId, character); await sleep(60); }
      feature.terminalInput(pane.dataset.paneId, '\r');
    };

    try {
      if (options.scene === 'terminal') {
        await cue('terminal-ready', '.terminal-pane', 'native terminal ready');
        await at(.9);
        await cue('command-input', '.terminal-pane', 'type project checks');
        await terminalType(firstPane, 'npm run check');
        await at(4.8);
        await cue('streamed-output', '.terminal-pane', 'read streamed test results');
        await at(5.5);
        await terminalType(firstPane, 'ls src');
        await at(8.7);
        feature.terminalInput(firstPane.dataset.paneId, '\x0c');
      } else if (options.scene === 'panels') {
        await cue('workspace-list', '.workspace-list', 'named project workspaces');
        await at(.8);
        click(await waitFor('button[title="New workspace"]'));
        const name = await waitFor('.dialog-form input');
        await type(name, 'Session Lab');
        await cue('workspace-name', '.dialog-form input', 'name a workspace');
        await at(2.0);
        name.closest('form').requestSubmit();
        await waitUntil(() => [...document.querySelectorAll('[data-workspace-id]')].some((item) => item.textContent.includes('Session Lab')));
        await at(2.7);
        await newTab('New terminal');
        await waitFor('.terminal-pane .xterm-helper-textarea');
        await cue('new-tab', '.tab-bar', 'add a terminal tab');
        await at(3.7);
        let pane = currentPane();
        const initial = panes().length;
        key(pane.querySelector('.xterm-helper-textarea'), 'd', { primary: true });
        await waitUntil(() => panes().length > initial);
        await cue('split-side-by-side', '.split-container.is-split', 'split terminals side by side');
        await at(4.9);
        pane = currentPane();
        const count = panes().length;
        key(pane.querySelector('.xterm-helper-textarea'), 'd', { primary: true, shift: true });
        await waitUntil(() => panes().length > count);
        await cue('split-stacked', '.split-container.is-split', 'split below for a second process');
        await at(5.7);
        await terminalType(currentPane(), 'ls src');
        await at(8.8);
        click([...document.querySelectorAll('.workspace-list-item')].find((item) => item.textContent.includes('Feature Preview')));
      } else if (options.scene === 'code') {
        await cue('typescript-editor', '.cm-content', 'open the TypeScript source');
        await at(.9);
        key(await waitFor('.cm-content'), 'f', { primary: true });
        const search = await waitFor('.cm-search input');
        await type(search, 'filterTasks', 65);
        await cue('editor-search', '.cm-search', 'find the filter function');
        await at(3.0);
        key(search, 'Escape');
        await at(3.7);
        feature.setEditorText(options.root, 'src/useWorkspaceFilter.ts',
          'export type Task = { id: string; title: string; status: "open" | "done" };\n\nexport function filterTasks(tasks: Task[], query: string, status: Task["status"] | "all") {\n  const normalized = query.trim().toLocaleLowerCase();\n\n  return tasks\n    .filter((task) =>\n      (!normalized || task.title.toLocaleLowerCase().includes(normalized)) &&\n      (status === "all" || task.status === status),\n    )\n    .sort((a, b) => a.title.localeCompare(b.title));\n}\n');
        await cue('edited-document', '.cm-line:nth-child(8)', 'refine the filter logic');
        await at(5.8);
        click(await waitFor('button.editor-save:not(:disabled)'));
        await waitUntil(() => document.querySelector('button.editor-save:disabled'));
        await cue('saved-document', '.cm-line:nth-child(8)', 'save the source changes');
      } else if (options.scene === 'expand') {
        await cue('browser-address', '.browser-toolbar', 'local app in the native browser');
        await at(1.0);
        const address = await waitFor('input[aria-label="Web address"]');
        address.focus(); address.select();
        await type(address, options.browserUrl, 28);
        await at(2.8);
        address.closest('form').requestSubmit();
        await at(4.7);
        await feature.browserEval(browserId, `document.querySelector('[data-action="review"]').click()`);
        await at(5.6);
        await cue('browser-page', '.browser-pane', 'interact with the running local app');
        await at(8.8);
        await feature.browserEval(browserId, `location.reload()`);
      } else if (options.scene === 'git') {
        await cue('source-control', '.source-panel', 'inspect repository changes');
        await at(1.3);
        await cue('diff-review', '.source-panel', 'review the native Git diff');
        await at(3.1);
        click(await waitFor('input[aria-label="Stage src/useWorkspaceFilter.ts"]'));
        await at(3.8);
        await cue('stage-change', '.source-panel', 'stage the reviewed source file');
        await type(await waitFor('textarea[aria-label="Commit message"]'), 'refine workspace task filtering', 42);
        await at(5.9);
        click(await waitFor('button[aria-label="Commit staged changes"]:not(:disabled)'));
        await at(7.2);
        await cue('commit-change', '.source-panel', 'commit the staged change');
        const history = [...document.querySelectorAll('.source-panel button')].find((button) => button.textContent.trim() === 'History');
        if (history) { click(history); await at(8.1); await cue('commit-history', '.source-panel', 'read the new commit in history'); }
      } else if (options.scene === 'spark') {
        await cue('chat-composer', '.chat-composer', 'separate AI chat in the workspace');
        await at(.8);
        await type(await waitFor('textarea[data-chat-input]'), 'Summarize the next step for this feature branch.', 40);
        await at(3.2);
        click(await waitFor('button.chat-send:not(:disabled)'));
        await at(6.6);
        await waitFor('.chat-message-assistant');
        await cue('chat-response', '.chat-message-assistant', 'read the streamed local fixture response');
      } else throw new Error(`Unknown feature scene: ${options.scene}`);
      await invoke('plugin_smoke_result', { stage: 'feature-movie-progress', data: { scene: options.scene, cues, complete: true, endedAt: Number(((performance.now() - started) / 1000).toFixed(3)) } });
    } catch (error) {
      await invoke('plugin_smoke_result', { stage: 'feature-movie-progress', data: { scene: options.scene, cues, error: String(error), stack: String(error?.stack ?? '') } });
    }
  }
  void capture().catch((error) => { void invoke('plugin_smoke_result', { stage: 'feature-movie-progress', data: { error: String(error), stack: String(error?.stack ?? '') } }); });
})();
