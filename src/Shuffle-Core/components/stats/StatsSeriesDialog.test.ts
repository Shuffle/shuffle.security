import { describe, it, expect } from 'vitest';
import { deviceStatKey, parseStatPoints } from './StatsSeriesDialog';

describe('stats helpers', () => {
  it('lowercases device id and replaces spaces', () => {
    expect(deviceStatKey('My Phone A', 'critical')).toBe('device_notification_my_phone_a_critical');
  });
  it('parses unix-second entries', () => {
    expect(parseStatPoints({ entries: [{ date: 1700000000, value: 3 }] })).toEqual([{ date: '2023-11-14', value: 3 }]);
  });
});
