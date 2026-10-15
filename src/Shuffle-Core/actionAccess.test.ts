import { describe, expect, it, vi } from 'vitest';
import { runSignedInAction } from './actionAccess';

describe('login-required actions', () => {
  it('blocks a signed-out action and shows sign-in feedback', () => {
    const action = vi.fn();
    const feedback = vi.fn();
    expect(runSignedInAction(false, action, feedback)).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(feedback).toHaveBeenCalledOnce();
  });

  it('allows a signed-in action without sign-in feedback', () => {
    const action = vi.fn();
    const feedback = vi.fn();
    expect(runSignedInAction(true, action, feedback)).toBe(true);
    expect(action).toHaveBeenCalledOnce();
    expect(feedback).not.toHaveBeenCalled();
  });
});