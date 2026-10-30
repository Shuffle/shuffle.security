import { describe, it, expect } from 'vitest';
import { getAppEditUrl } from './appEditUrl';

const core = (p: string) => `https://shuffler.io${p}`;

describe('getAppEditUrl', () => {
  it('sends the owner to /apps/edit/{id}', () => {
    expect(getAppEditUrl({ owner: 'u1' }, 'abc', { id: 'u1' }, core).url).toBe('https://shuffler.io/apps/edit/abc');
  });
  it('sends a contributor to /apps/edit/{id}', () => {
    expect(getAppEditUrl({ owner: 'x', contributors: ['me@x.com'] }, 'abc', { id: 'u2', username: 'me@x.com' }, core).url).toBe('https://shuffler.io/apps/edit/abc');
  });
  it('sends anyone else to the fork page', () => {
    expect(getAppEditUrl({ owner: 'x' }, 'abc', { id: 'u2' }, core).url).toBe('https://shuffler.io/apps/new?id=abc&fork=true');
    expect(getAppEditUrl({ owner: 'x' }, 'abc', null, core).url).toBe('https://shuffler.io/apps/new?id=abc&fork=true');
  });
});
