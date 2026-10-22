// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';

const setHost = (hostname: string) => {
  Object.defineProperty(window, 'location', { value: new URL(`https://${hostname}/agents`), writable: true });
};

describe('setHostBaseUrl globalUrl handling', () => {
  afterEach(async () => { const m = await import('./api'); m.setHostBaseUrl(null); });

  it('honors a cloud globalUrl when embedded on shuffler.io', async () => {
    setHost('shuffler.io');
    const m = await import('./api');
    m.setHostBaseUrl('https://ca.shuffler.io');
    expect(m.getHostBaseUrl()).toBe('https://ca.shuffler.io');
  });

  it('maps a shuffle.security globalUrl back to shuffler.io on shuffler.io', async () => {
    setHost('shuffler.io');
    const m = await import('./api');
    m.setHostBaseUrl('https://uk.shuffle.security');
    expect(m.getHostBaseUrl()).toBe('https://uk.shuffler.io');
  });

  it('honors a self-hosted globalUrl', async () => {
    setHost('shuffler.io');
    const m = await import('./api');
    m.setHostBaseUrl('https://soar.example.com/');
    expect(m.getHostBaseUrl()).toBe('https://soar.example.com');
  });
});
