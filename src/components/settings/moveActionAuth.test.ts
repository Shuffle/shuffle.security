import { describe, it, expect } from 'vitest';
import { getShuffleOpenApiAuthState, SHUFFLE_OPENAPI_APP_ID } from './moveActionAuth';

describe('getShuffleOpenApiAuthState', () => {
  it('is missing when no auth for the Shuffle OpenAPI app exists', () => {
    expect(getShuffleOpenApiAuthState([{ app: { id: 'other' }, validation: { valid: true } }])).toBe('missing');
  });
  it('is valid when a validated auth exists', () => {
    expect(getShuffleOpenApiAuthState([{ app: { id: SHUFFLE_OPENAPI_APP_ID }, validation: { valid: true } }])).toBe('valid');
  });
  it('is unvalidated when auth exists but has not validated', () => {
    expect(getShuffleOpenApiAuthState([{ app_id: SHUFFLE_OPENAPI_APP_ID }])).toBe('unvalidated');
  });
  it('ignores inactive auths', () => {
    expect(getShuffleOpenApiAuthState([{ app: { id: SHUFFLE_OPENAPI_APP_ID }, active: false, validation: { valid: true } }])).toBe('missing');
  });
});
