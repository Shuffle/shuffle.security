import { describe, it, expect } from 'vitest';
import { getRoutingAreaTitle } from './routingWorkflowUtils';

describe('getRoutingAreaTitle', () => {
  it('keeps the incidents wording for the default category', () => {
    expect(getRoutingAreaTitle({ singular: 'incident', plural: 'incidents' })).toBe('Incident Routing Rules');
  });

  it('renames the area after the selected category', () => {
    expect(getRoutingAreaTitle({ singular: 'vulnerability', plural: 'vulnerabilities' })).toBe('Vulnerability Routing Rules');
    expect(getRoutingAreaTitle({ singular: 'sensor', plural: 'sensors' })).toBe('Sensor Routing Rules');
    expect(getRoutingAreaTitle({ singular: 'software', plural: 'software' })).toBe('Software Routing Rules');
  });

  it('falls back to incidents when no category is selected', () => {
    expect(getRoutingAreaTitle()).toBe('Incident Routing Rules');
  });
});
