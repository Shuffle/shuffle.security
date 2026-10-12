import { describe, expect, it } from 'vitest';
import { deploymentLoginRedirect, isHostDeploymentRequested } from './deploymentLoginRedirect';

const signedOut = { authenticated: false, loading: false, dialog: false, requested: false };

describe('monitor deployment sign-in access', () => {
  it('recognizes deployment intent from direct URLs and router-serialized links', () => {
    expect(isHostDeploymentRequested('true')).toBe(true);
    expect(isHostDeploymentRequested('"true"')).toBe(true);
    expect(isHostDeploymentRequested('false')).toBe(false);
    expect(isHostDeploymentRequested(null)).toBe(false);
  });

  it('redirects signed-out embedded deployment to sign in with deployment preserved', () => {
    expect(deploymentLoginRedirect({ ...signedOut, dialog: true })).toBe('/login?view=%2Fmonitors%3Fadd_host%3Dtrue');
  });

  it('redirects signed-out deployment links to the same sign-in destination', () => {
    expect(deploymentLoginRedirect({ ...signedOut, requested: true })).toBe('/login?view=%2Fmonitors%3Fadd_host%3Dtrue');
  });

  it('keeps the public monitors page accessible without a deployment request', () => {
    expect(deploymentLoginRedirect(signedOut)).toBeNull();
  });

  it('waits for the session check before deciding access', () => {
    expect(deploymentLoginRedirect({ ...signedOut, dialog: true, requested: true, loading: true })).toBeNull();
  });

  it('allows signed-in deployment without a redirect', () => {
    expect(deploymentLoginRedirect({ ...signedOut, dialog: true, requested: true, authenticated: true })).toBeNull();
  });
});