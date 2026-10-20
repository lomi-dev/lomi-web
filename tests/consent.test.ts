/// <reference types="bun" />
import { afterEach, describe, it, spyOn } from 'bun:test';
import assert from 'node:assert/strict';

const KEY = 'lomi.cookie-consent';
const LIFETIME = 180 * 24 * 60 * 60 * 1000;
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
let moduleId = 0;
let now = 1_800_000_000_000;
let dateSpy: ReturnType<typeof spyOn> | undefined;

function browser(raw: string | null = null, blocked: 'get' | 'set' | 'set-remove' | 'access' | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[KEY, raw]]);
  const storage = {
    getItem(key: string) {
      if (blocked === 'get') throw new Error('Blocked');
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (blocked === 'set' || blocked === 'set-remove') throw new Error('Full');
      values.set(key, value);
    },
    removeItem(key: string) {
      if (blocked === 'set-remove') throw new Error('Denied');
      values.delete(key);
    },
  };
  const timers = new Map<number, { run: () => void; delay: number }>();
  let timerId = 0;
  const win = Object.assign(new EventTarget(), {
    setTimeout(run: () => void, delay: number) {
      timers.set(++timerId, { run, delay });
      return timerId;
    },
    clearTimeout(id: number) { timers.delete(id); },
  });
  Object.defineProperty(win, 'localStorage', {
    get() {
      if (blocked === 'access') throw new Error('Denied');
      return storage;
    },
  });
  const doc = new EventTarget();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: win });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
  dateSpy = spyOn(Date, 'now').mockImplementation(() => now);
  return {
    win, doc, values, timers, storage,
    storageEvent(key: string | null, newValue: string | null, storageArea: unknown = storage, applyToStorage = true) {
      if (applyToStorage && storageArea === storage) {
        if (key === null) values.clear();
        else if (newValue === null) values.delete(key);
        else values.set(key, newValue);
      }
      const event = new Event('storage');
      Object.assign(event, { key, newValue, storageArea });
      win.dispatchEvent(event);
    },
    runTimer() {
      const [id, timer] = [...timers][0]!;
      timers.delete(id);
      timer.run();
    },
  };
}

async function freshStore(): Promise<typeof import('../src/lib/consent')> {
  return import(`../src/lib/consent.ts?test=${moduleId++}`);
}

function record(externalMedia = true, savedAt = now) {
  return JSON.stringify({ version: 1, externalMedia, savedAt });
}

afterEach(() => {
  dateSpy?.mockRestore();
  dateSpy = undefined;
  now = 1_800_000_000_000;
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

describe('consent records', () => {
  it('is safe to import and call during server rendering', async () => {
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    const store = await freshStore();
    assert.equal(store.getConsent(), null);
    assert.equal(store.hasMediaConsent(), false);
    assert.equal(store.saveConsent(true).persisted, false);
    assert.equal(store.getConsent(), null);
    store.onConsentChange(() => assert.fail('SSR notification'))();
    store.requestConsentSettings();
    // An SSR read must not prevent initialization once a browser is present.
    browser(record(false));
    assert.equal(store.getConsent()?.externalMedia, false);
  });

  it('exposes the agreed constants and remembers acceptance and refusal equally', async () => {
    const env = browser();
    const store = await freshStore();
    assert.equal(store.CONSENT_STORAGE_KEY, KEY);
    assert.equal(store.CONSENT_VERSION, 1);
    assert.equal(store.CONSENT_LIFETIME, LIFETIME);
    for (const externalMedia of [true, false]) {
      const result = store.saveConsent(externalMedia);
      assert.deepEqual(result, { choice: JSON.parse(record(externalMedia)), persisted: true });
      assert.equal(env.values.get(KEY), record(externalMedia));
      assert.equal(store.hasMediaConsent(), externalMedia);
      assert.deepEqual(store.getConsent(), result.choice);
    }
    const returned = store.getConsent()!;
    returned.externalMedia = true;
    assert.equal(store.hasMediaConsent(), false);
  });

  it('fails closed for malformed, future, expired and unsupported records', async () => {
    const malformed: unknown[] = [
      null, [], true, 42, 'accepted', {},
      { version: 2, externalMedia: true, savedAt: now },
      { version: 1, externalMedia: 'true', savedAt: now },
      { version: 1, externalMedia: true, savedAt: `${now}` },
      { version: 1, externalMedia: true, savedAt: -1 },
      { version: 1, externalMedia: true, savedAt: now + 1 },
      { version: 1, externalMedia: true, savedAt: now - LIFETIME },
      { version: 1, externalMedia: true, savedAt: now - 0.5 },
      { version: 1, externalMedia: true, savedAt: now, analytics: true },
    ];
    for (const raw of ['broken JSON', ...malformed.map((value) => JSON.stringify(value))]) {
      dateSpy?.mockRestore();
      browser(raw);
      const store = await freshStore();
      assert.equal(store.getConsent(), null, raw);
      assert.equal(store.hasMediaConsent(), false, raw);
    }
    dateSpy?.mockRestore();
    browser(record(true, now - LIFETIME + 1));
    assert.equal((await freshStore()).hasMediaConsent(), true);
  });

  it('keeps the tab choice when storage access, reads or writes fail', async () => {
    for (const blocked of ['access', 'get', 'set'] as const) {
      dateSpy?.mockRestore();
      browser(null, blocked);
      const store = await freshStore();
      assert.equal(store.getConsent(), null);
      for (const externalMedia of [true, false]) {
        const result = store.saveConsent(externalMedia);
        assert.equal(result.persisted, blocked === 'get');
        assert.equal(store.hasMediaConsent(), externalMedia);
      }
    }
  });

  it('removes a stale grant after a failed refusal so queued events and reload cannot restore it', async () => {
    const env = browser(record(true), 'set');
    env.values.set('unrelated-preference', 'keep');
    const store = await freshStore();
    assert.equal(store.hasMediaConsent(), true);
    now += 1;
    assert.equal(store.saveConsent(false).persisted, false);
    assert.equal(env.values.has(KEY), false);
    assert.equal(env.values.get('unrelated-preference'), 'keep');
    env.storageEvent(KEY, record(true, now - 1), env.storage, false);
    assert.equal(store.hasMediaConsent(), false);
    const reloadedStore = await freshStore();
    assert.equal(reloadedStore.getConsent(), null);
    assert.equal(reloadedStore.hasMediaConsent(), false);
  });

  it('keeps a failed refusal authoritative for this tab when stale storage cannot be removed', async () => {
    const staleGrant = record(true);
    const env = browser(staleGrant, 'set-remove');
    const store = await freshStore();
    assert.equal(store.hasMediaConsent(), true);
    now += 1;
    assert.equal(store.saveConsent(false).persisted, false);
    assert.equal(env.values.get(KEY), staleGrant);
    env.storageEvent(KEY, staleGrant, env.storage, false);
    assert.equal(store.getConsent()?.externalMedia, false);
    assert.equal(store.hasMediaConsent(), false);
    now += LIFETIME;
    assert.equal(store.getConsent(), null);
    env.storageEvent(KEY, record(true), env.storage);
    assert.equal(store.getConsent(), null);
    // The override ends with the next explicit local choice.
    store.saveConsent(true);
    assert.equal(store.hasMediaConsent(), true);
    env.storageEvent(KEY, record(true), env.storage, false);
    assert.equal(store.hasMediaConsent(), true);
  });

  it('reports failed browser saves after applying the choice, without reporting successful saves', async () => {
    for (const blocked of [null, 'access', 'set'] as const) {
      dateSpy?.mockRestore();
      const env = browser(null, blocked);
      const store = await freshStore();
      const observedChoices: boolean[] = [];
      env.win.addEventListener('lomi:consent-storage-error', () => {
        observedChoices.push(store.hasMediaConsent());
      });
      store.saveConsent(true);
      store.saveConsent(false);
      assert.deepEqual(observedChoices, blocked === null ? [] : [true, false]);
    }
  });
});

describe('consent updates and expiry', () => {
  it('notifies once per change and allows reading in a subscriber without recursion', async () => {
    browser();
    const store = await freshStore();
    const changes: unknown[] = [];
    const unsubscribe = store.onConsentChange((choice) => {
      changes.push(choice);
      assert.deepEqual(store.getConsent(), choice);
      if (choice) choice.externalMedia = false;
    });
    store.saveConsent(true);
    assert.equal(store.hasMediaConsent(), true);
    store.saveConsent(true);
    assert.equal(changes.length, 1);
    unsubscribe();
    store.saveConsent(false);
    assert.equal(changes.length, 1);
  });

  it('synchronizes valid changes and revokes on invalid records, removal and clear', async () => {
    const env = browser();
    const store = await freshStore();
    const changes: unknown[] = [];
    store.onConsentChange((choice) => changes.push(choice));
    for (const revoke of [
      () => env.storageEvent(KEY, record(false)),
      () => env.storageEvent(KEY, 'invalid'),
      () => env.storageEvent(KEY, record(true, now + 1)),
      () => env.storageEvent(KEY, record(true, now - LIFETIME)),
      () => env.storageEvent(KEY, null),
      () => env.storageEvent(null, null),
    ]) {
      env.storageEvent(KEY, record(true));
      assert.equal(store.hasMediaConsent(), true);
      revoke();
      assert.equal(store.hasMediaConsent(), false);
    }
    assert.equal(changes.length, 12);
    env.storageEvent('other', record(true));
    env.storageEvent(KEY, record(true), {});
    assert.equal(store.hasMediaConsent(), false);
  });

  it('uses current storage when a queued grant arrives after rejection or clearing', async () => {
    const env = browser();
    const store = await freshStore();
    const staleGrant = record(true);
    store.saveConsent(true);
    now += 1;
    store.saveConsent(false);
    env.storageEvent(KEY, staleGrant, env.storage, false);
    assert.equal(store.hasMediaConsent(), false);
    assert.equal(store.getConsent()?.externalMedia, false);
    assert.equal(env.values.get(KEY), record(false));

    env.values.clear();
    env.storageEvent(KEY, staleGrant, env.storage, false);
    assert.equal(store.getConsent(), null);
    assert.equal(store.hasMediaConsent(), false);
    assert.equal(env.values.has(KEY), false);
  });

  it('fails closed if current storage cannot be read during synchronization', async () => {
    const env = browser(null, 'get');
    const store = await freshStore();
    store.saveConsent(true);
    assert.equal(store.hasMediaConsent(), true);
    env.storageEvent(KEY, record(true));
    assert.equal(store.getConsent(), null);
  });

  it('caps long timers and revokes on expiry even when a tab remains open', async () => {
    const env = browser(record());
    const store = await freshStore();
    const changes: unknown[] = [];
    store.onConsentChange((choice) => changes.push(choice));
    assert.equal([...env.timers.values()][0]?.delay, 2_147_483_647);
    now += 2_147_483_647;
    env.runTimer();
    assert.equal(store.hasMediaConsent(), true);
    assert.equal([...env.timers.values()][0]?.delay, 2_147_483_647);
    now += LIFETIME;
    env.runTimer();
    assert.equal(store.hasMediaConsent(), false);
    assert.deepEqual(changes, [null]);
    assert.equal(env.timers.size, 0);
  });

  it('rechecks expiry on reads, page restoration and visibility changes', async () => {
    for (const trigger of ['read', 'pageshow', 'visibilitychange']) {
      dateSpy?.mockRestore();
      const env = browser(record());
      const store = await freshStore();
      const changes: unknown[] = [];
      store.onConsentChange((choice) => changes.push(choice));
      now += LIFETIME;
      if (trigger === 'read') store.getConsent();
      else (trigger === 'pageshow' ? env.win : env.doc).dispatchEvent(new Event(trigger));
      assert.deepEqual(changes, [null], trigger);
      assert.equal(store.getConsent(), null);
      assert.equal(env.timers.size, 0);
    }
  });

  it('opens settings with the original trigger in event detail', async () => {
    const env = browser();
    const store = await freshStore();
    const trigger = {} as HTMLElement;
    let detail: unknown;
    env.win.addEventListener('lomi:consent-settings', (event) => {
      detail = (event as CustomEvent).detail;
    });
    store.requestConsentSettings(trigger);
    assert.deepEqual(detail, { trigger });
  });
});
