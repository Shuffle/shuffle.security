import { describe, expect, it } from 'vitest';
import { isPaginationSettling } from './listPaginationState';

describe('isPaginationSettling', () => {
  it('shows loading while fewer than 5 pages are loaded', () => {
    expect(isPaginationSettling(4, true)).toBe(true);
  });
  it('shows page numbers once 5 pages are loaded, even while loading more', () => {
    expect(isPaginationSettling(5, true)).toBe(false);
  });
  it('shows page numbers when loading is done', () => {
    expect(isPaginationSettling(2, false)).toBe(false);
  });
});
