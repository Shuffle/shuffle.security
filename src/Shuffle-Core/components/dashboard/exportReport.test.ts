import { describe, expect, it } from 'vitest';
import { REPORT_SECTIONS, visibleReportSections } from './exportReport';

describe('report section picker', () => {
  it('hides sub-tenants when the tenant has no children', () => {
    const ids = visibleReportSections(false).map((s) => s.id);
    expect(ids).not.toContain('subtenants');
    expect(ids.length).toBe(REPORT_SECTIONS.length - 1);
  });

  it('shows sub-tenants when the tenant has children', () => {
    const ids = visibleReportSections(true).map((s) => s.id);
    expect(ids).toContain('subtenants');
    expect(ids.length).toBe(REPORT_SECTIONS.length);
  });

  it('marks only time-based sections as using the range', () => {
    const scoped = Object.fromEntries(REPORT_SECTIONS.map((s) => [s.id, s.rangeScoped]));
    expect(scoped).toEqual({
      dashboards: true,
      tenant: false,
      subtenants: false,
      incidents: true,
      workflows: false,
      runs: true,
      apps: false,
      vulnerabilities: true,
      locations: false,
    });
  });
});

describe('report section order', () => {
  it('follows the documentation groups: Tenant, Security, Automation, Infrastructure', async () => {
    const { REPORT_GROUPS } = await import('./exportReport');
    expect(REPORT_GROUPS.map((g) => g.label)).toEqual(['Tenant', 'Security', 'Automation', 'Infrastructure']);
    const order = REPORT_GROUPS.map((g) => g.id);
    const groupIdx = REPORT_SECTIONS.map((s) => order.indexOf(s.group));
    expect(groupIdx).toEqual([...groupIdx].sort((a, b) => a - b));
  });
});
