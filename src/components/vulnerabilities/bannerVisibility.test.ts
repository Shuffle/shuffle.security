import { describe, expect, it } from 'vitest';
import { shouldShowVulnerabilityAutomationBanner } from './bannerVisibility';

describe('shouldShowVulnerabilityAutomationBanner', () => {
  it('hides the bar once the automation is active', () => {
    expect(shouldShowVulnerabilityAutomationBanner({ active: true, isLoading: false })).toBe(false);
  });

  it('shows the bar while the automation is not running', () => {
    expect(shouldShowVulnerabilityAutomationBanner({ active: false, isLoading: false })).toBe(true);
  });

  it('stays hidden while the workflow list is still loading', () => {
    expect(shouldShowVulnerabilityAutomationBanner({ active: false, isLoading: true })).toBe(false);
  });
});
