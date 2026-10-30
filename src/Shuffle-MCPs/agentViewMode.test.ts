import { describe, expect, it } from 'vitest';

import { resolveAgentRunView } from '@/Shuffle-MCPs/agentViewMode';

describe('resolveAgentRunView', () => {
  it('opens Chat when only the host asked for Chat', () => {
    expect(resolveAgentRunView({ initialView: 'chat' })).toBe('chat');
  });

  it('opens Timeline when nothing is known', () => {
    expect(resolveAgentRunView({})).toBe('detailed');
  });

  it('keeps the tab the user last chose over the host default', () => {
    expect(resolveAgentRunView({ storedView: 'detailed', initialView: 'chat' })).toBe('detailed');
    expect(resolveAgentRunView({ storedView: 'chat', initialView: 'detailed' })).toBe('chat');
  });

  it('keeps this page's choice over the browser-wide one', () => {
    expect(resolveAgentRunView({ contextView: 'chat', storedView: 'detailed' })).toBe('chat');
  });

  it('keeps a shared run link over saved choices', () => {
    expect(resolveAgentRunView({ urlView: 'detailed', contextView: 'chat' })).toBe('detailed');
  });

  it('treats a Start choice as no run-view answer', () => {
    expect(resolveAgentRunView({ contextView: 'start', initialView: 'chat' })).toBe('chat');
  });

  it('maps the removed Simple view to Chat', () => {
    expect(resolveAgentRunView({ storedView: 'simple' })).toBe('chat');
    expect(resolveAgentRunView({ contextView: 'simple' })).toBe('chat');
    expect(resolveAgentRunView({ urlView: 'simple' })).toBe('chat');
    expect(resolveAgentRunView({ initialView: 'simple' })).toBe('chat');
  });
});
