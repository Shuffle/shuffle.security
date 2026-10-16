import { describe, expect, it } from 'vitest';
import { getListPage } from './listPaginationState';

describe('filtered list pagination', () => {
  it('shows matching rows when page 3 is narrowed to 50 or fewer results', () => {
    for (const count of [1, 25, 50]) {
      const rows = Array.from({ length: count }, (_, i) => i);
      const page = getListPage(3, rows.length, 50);
      expect(page).toBe(1);
      expect(rows.slice((page - 1) * 50, page * 50)).toEqual(rows);
    }
  });

  it('clamps to the remaining last page after records are removed', () => {
    expect(getListPage(3, 75, 50)).toBe(2);
  });

  it('preserves the current page when a server batch adds more rows', () => {
    expect(getListPage(3, 200, 50)).toBe(3);
  });

  it('keeps empty lists on page one', () => {
    expect(getListPage(3, 0, 50)).toBe(1);
  });
});