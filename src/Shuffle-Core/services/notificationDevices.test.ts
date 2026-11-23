import { describe, it, expect } from 'vitest';
import { findLocalDevice } from './notificationDevices';

describe('findLocalDevice', () => {
  const devices = [
    { id: 'a', device_name: 'Chrome on macOS', token: 'tok-a' },
    { id: 'b', device_name: 'Chrome on macOS', token: 'tok-b' },
  ];
  it('matches by stored id first', () => {
    expect(findLocalDevice(devices, 'b', 'tok-a')?.id).toBe('b');
  });
  it('falls back to the push token when the stored id is unknown', () => {
    expect(findLocalDevice(devices, 'new-id', 'tok-b')?.id).toBe('b');
  });
  it('finds nothing without id or token match', () => {
    expect(findLocalDevice(devices, 'new-id', 'tok-x')).toBeUndefined();
  });
});
