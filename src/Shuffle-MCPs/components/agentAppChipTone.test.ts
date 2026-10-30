import { describe, it, expect } from 'vitest';
import { agentAppChipTone } from './AgentUI';

describe('agentAppChipTone', () => {
  it('renders a chosen app that still needs credentials like an authenticated one', () => {
    expect(agentAppChipTone({ needsAuth: true, isUnavailable: false })).toBe('normal');
    expect(agentAppChipTone({ needsAuth: false, isUnavailable: false })).toBe('normal');
  });

  it('only flags an app that is not configured in this workspace', () => {
    expect(agentAppChipTone({ needsAuth: false, isUnavailable: true })).toBe('unavailable');
    expect(agentAppChipTone({ needsAuth: true, isUnavailable: true })).toBe('unavailable');
  });
});
