import { describe, expect, it } from 'vitest';
import { publicAppImage, PUBLIC_APP_IMAGE_FALLBACK } from './publicAppImages';

/**
 * Signed-out agent executions render app icons from this static map when
 * the public app catalog (Algolia appsearch) is unreachable or
 * rate-limited. Every tool the sample data uses must resolve.
 */
const SAMPLE_AGENT_TOOLS = [
  'virustotal',
  'microsoft_defender',
  'crowdstrike_falcon',
  'jira',
  'slack',
  'abuseipdb',
  'okta',
];

describe('publicAppImages', () => {
  it('resolves every sample agent tool name to a public image URL', () => {
    for (const tool of SAMPLE_AGENT_TOOLS) {
      expect(publicAppImage(tool), tool).toMatch(/^https:\/\/storage\.googleapis\.com\/shuffle_public\/app_images\/.+\.png$/);
    }
  });

  it('normalizes spaced and dashed names the same as slugs', () => {
    expect(publicAppImage('Microsoft Defender')).toBe(PUBLIC_APP_IMAGE_FALLBACK.microsoft_defender);
    expect(publicAppImage('crowdstrike-falcon')).toBe(publicAppImage('crowdstrike_falcon'));
  });

  it('returns an empty string for unknown apps', () => {
    expect(publicAppImage('definitely_not_a_real_app_xyz')).toBe('');
    expect(publicAppImage('')).toBe('');
  });
});
