import { describe, expect, it } from 'vitest';
import { getSuggestionAppRequirements } from './agentSuggestionApps';

/**
 * Suggestions about apps and integrations must pre-select the current
 * "Shuffle Apps" app, not the older "Shuffle App Management" name.
 */
describe('agentSuggestionApps — Shuffle Apps injection', () => {
  it('injects shuffle_apps for app / integration suggestions', () => {
    expect(getSuggestionAppRequirements('List all apps we have connected')).toContainEqual({
      kind: 'app',
      value: 'shuffle_apps',
      label: 'Shuffle Apps',
    });
    expect(getSuggestionAppRequirements('Which integrations cover our SIEM coverage report?')).toContainEqual({
      kind: 'app',
      value: 'shuffle_apps',
      label: 'Shuffle Apps',
    });
  });

  it('never injects the legacy shuffles_app_management app', () => {
    const suggestions = [
      'List all apps we have connected',
      'Which integrations cover our SIEM coverage report?',
      'Build a workflow that syncs apps to the datastore',
      'Triage this incident and check the apps',
    ];
    for (const suggestion of suggestions) {
      const values = getSuggestionAppRequirements(suggestion, 6).map((r) => r.value);
      expect(values, suggestion).not.toContain('shuffles_app_management');
    }
  });
});
