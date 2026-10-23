export function canonicalUrl(pathname: string, site?: URL): URL | undefined {
  return site ? new URL(pathname, site) : undefined;
}

/** Serialize JSON-LD so data cannot close its containing HTML script element. */
export function serializeJsonLd(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) throw new TypeError('JSON-LD value must be serializable.');
  return json.replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
