import { describe, expect, it } from 'vitest';
import { SHUFFLE_PLAY_STORE_URL } from './AppStoreBadges';

describe('AppStoreBadges store links', () => {
  it('links the Google Play badge to the Shuffle Security Android listing', () => {
    expect(SHUFFLE_PLAY_STORE_URL).toBe(
      'https://play.google.com/store/apps/details?id=shuffle.security',
    );
  });
});
