import { describe, expect, it } from 'vitest';
import { getUsecaseToggleChip } from './usecaseToggleChip';

describe('getUsecaseToggleChip', () => {
  it('labels an active usecase "Enabled" in the positive colour', () => {
    expect(getUsecaseToggleChip(true)).toEqual({ label: 'Enabled', positive: true });
  });

  it('labels an inactive usecase "Disabled" in the warning colour', () => {
    expect(getUsecaseToggleChip(false)).toEqual({ label: 'Disabled', positive: false });
  });

  it('keeps the warning colour for an active but blocked usecase', () => {
    expect(getUsecaseToggleChip(true, true)).toEqual({ label: 'Enabled', positive: false });
  });

  it('lets presence-driven usecases keep their own state word', () => {
    expect(getUsecaseToggleChip(true, false, 'Active')).toEqual({ label: 'Active', positive: true });
  });
});
