/** The 180-day expiry is a product policy, not a universal legal requirement. */
export const CONSENT_STORAGE_KEY = 'lomi.cookie-consent';
export const CONSENT_VERSION = 1;
export const CONSENT_LIFETIME = 180 * 24 * 60 * 60 * 1000;

export type ConsentChoice = { version: 1; externalMedia: boolean; savedAt: number };

let initialized = false;
let current: ConsentChoice | null = null;
let failedRefusal = false;
let expiryTimer: number | undefined;
const listeners = new Set<(choice: ConsentChoice | null) => void>();
const MAX_TIMEOUT = 2_147_483_647;

function parseChoice(raw: string | null): ConsentChoice | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== 3 || record.version !== CONSENT_VERSION ||
      typeof record.externalMedia !== 'boolean' || typeof record.savedAt !== 'number' ||
      !Number.isSafeInteger(record.savedAt) || record.savedAt < 0 ||
      record.savedAt > Date.now() || Date.now() - record.savedAt >= CONSENT_LIFETIME) return null;
    return { version: CONSENT_VERSION, externalMedia: record.externalMedia, savedAt: record.savedAt };
  } catch {
    return null;
  }
}

function copyChoice(): ConsentChoice | null {
  return current ? { ...current } : null;
}

function scheduleExpiry(): void {
  if (expiryTimer !== undefined) window.clearTimeout(expiryTimer);
  expiryTimer = undefined;
  if (current) {
    const remaining = current.savedAt + CONSENT_LIFETIME - Date.now();
    expiryTimer = window.setTimeout(() => {
      expiryTimer = undefined;
      checkExpiry();
      // Browser timers are capped at about 25 days; recheck until expiry.
      if (current) scheduleExpiry();
    }, Math.min(MAX_TIMEOUT, Math.max(0, remaining)));
  }
}

function update(choice: ConsentChoice | null): void {
  if (current?.version === choice?.version && current?.externalMedia === choice?.externalMedia &&
    current?.savedAt === choice?.savedAt) return;
  current = choice;
  scheduleExpiry();
  for (const listener of [...listeners]) listener(copyChoice());
}

function checkExpiry(): void {
  if (current && (current.savedAt > Date.now() || Date.now() - current.savedAt >= CONSENT_LIFETIME)) {
    update(null);
  }
}

function initialize(): boolean {
  if (typeof window === 'undefined') return false;
  if (initialized) return true;
  initialized = true;
  try {
    current = parseChoice(window.localStorage.getItem(CONSENT_STORAGE_KEY));
  } catch {
    current = null;
  }
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== CONSENT_STORAGE_KEY) return;
    if (event.storageArea !== null) {
      try {
        if (event.storageArea !== window.localStorage) return;
      } catch {
        return;
      }
    }
    // Events may be queued behind a newer local choice; consult current storage.
    let choice: ConsentChoice | null = null;
    try {
      choice = parseChoice(window.localStorage.getItem(CONSENT_STORAGE_KEY));
    } catch {
      // An unreadable preference cannot authorize external media.
    }
    checkExpiry();
    // A failed local refusal outranks stale stored grants for this document.
    if (failedRefusal && choice?.externalMedia) {
      choice = current?.externalMedia === false ? current : null;
    }
    update(choice);
  });
  window.addEventListener('pageshow', checkExpiry);
  document.addEventListener('visibilitychange', checkExpiry);
  scheduleExpiry();
  return true;
}

export function getConsent(): ConsentChoice | null {
  if (!initialize()) return null;
  checkExpiry();
  return copyChoice();
}

export function hasMediaConsent(): boolean {
  return getConsent()?.externalMedia === true;
}

export function saveConsent(externalMedia: boolean): { choice: ConsentChoice; persisted: boolean } {
  const choice: ConsentChoice = { version: CONSENT_VERSION, externalMedia, savedAt: Date.now() };
  if (!initialize()) return { choice, persisted: false };
  let persisted = false;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(choice));
    persisted = true;
  } catch {
    // A blocked or full store still permits a choice for this tab's lifetime.
    try {
      window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // Some browsers deny removal too; keep refusals authoritative in memory.
    }
  }
  failedRefusal = !persisted && !externalMedia;
  update(choice);
  if (!persisted) window.dispatchEvent(new CustomEvent('lomi:consent-storage-error'));
  return { choice: { ...choice }, persisted };
}

export function onConsentChange(listener: (choice: ConsentChoice | null) => void): () => void {
  if (!initialize()) return () => {};
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function requestConsentSettings(trigger?: HTMLElement): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('lomi:consent-settings', { detail: { trigger } }));
  }
}
