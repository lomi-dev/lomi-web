import { describe, expect, it } from 'bun:test';
import { canonicalUrl, serializeJsonLd } from '../src/lib/seo';

describe('SEO helpers', () => {
  it('keeps canonical paths on the configured site origin and preserves slash style', () => {
    const fixtureSite = new URL('https://fixture.example');
    expect(canonicalUrl('/', fixtureSite)?.href).toBe('https://fixture.example/');
    expect(canonicalUrl('/devlog/', fixtureSite)?.href).toBe('https://fixture.example/devlog/');
    expect(canonicalUrl('/devlog', fixtureSite)?.href).toBe('https://fixture.example/devlog');
    expect(canonicalUrl('/devlog/', undefined)).toBeUndefined();
  });

  it('escapes script-closing input while preserving valid JSON data', () => {
    const value = { description: '</script><script>alert(1)</script>', separator: '\u2028\u2029' };
    const serialized = serializeJsonLd(value);

    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('\u2028');
    expect(serialized).not.toContain('\u2029');
    expect(serialized).toContain('\\u2028');
    expect(JSON.parse(serialized)).toEqual(value);
  });

  it('rejects values that JSON.stringify cannot serialize', () => {
    expect(() => serializeJsonLd(undefined)).toThrow('JSON-LD value must be serializable.');
  });
});
