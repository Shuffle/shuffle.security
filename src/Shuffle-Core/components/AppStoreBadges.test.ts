import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppStoreBadges, SHUFFLE_PLAY_STORE_URL } from './AppStoreBadges';

describe('AppStoreBadges store links', () => {
  it('links the Google Play badge to the Shuffle Security Android listing', () => {
    expect(SHUFFLE_PLAY_STORE_URL).toBe(
      'https://play.google.com/store/apps/details?id=shuffle.security',
    );
  });

  it('renders the Google Play badge before the App Store badge', () => {
    const html = renderToStaticMarkup(createElement(AppStoreBadges));
    const playIndex = html.indexOf('Get it on Google Play');
    const iosIndex = html.indexOf('Download on the App Store');

    expect(playIndex).toBeGreaterThanOrEqual(0);
    expect(iosIndex).toBeGreaterThanOrEqual(0);
    expect(playIndex).toBeLessThan(iosIndex);
  });

  it('keeps the App Store badge marked as coming soon after the Google Play badge', () => {
    const html = renderToStaticMarkup(createElement(AppStoreBadges, { iosComingSoon: true }));
    const playIndex = html.indexOf('Get it on Google Play');
    const soonIndex = html.indexOf('Download on the App Store — coming soon');

    expect(playIndex).toBeGreaterThanOrEqual(0);
    expect(soonIndex).toBeGreaterThanOrEqual(0);
    expect(playIndex).toBeLessThan(soonIndex);
    expect(html).not.toContain('apps.apple.com');
  });
});
