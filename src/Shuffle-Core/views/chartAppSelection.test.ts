import { describe, expect, it } from 'vitest';
import { addChartSelection, restoreChartSelections, addSelectedChartApp, canRemoveChartApp, removeGuestChartApp } from './chartAppSelection';

describe('Alluvial app selection', () => {
  it('restores manually selected tools after reloading without inventing authentication', () => {
    const params = addChartSelection(new URLSearchParams('flow=siem'), 'left', 'Gmail');
    const reloaded = new URLSearchParams(params.toString());
    const apps = restoreChartSelections([], (reloaded.get('source') || '').split(','), {});
    expect(reloaded.get('flow')).toBe('siem');
    expect(apps).toEqual([{ id: '', name: 'Gmail', icon: '', hasValidAuth: false, isActiveOnly: false }]);
  });

  it('keeps restored destinations separate and preserves real credential status', () => {
    const params = addChartSelection(new URLSearchParams('source=Gmail'), 'right', 'Slack');
    const existing = [{ id: 'slack-canonical-id', name: 'Slack', icon: '', hasValidAuth: true, isActiveOnly: false }];
    expect(params.get('source')).toBe('Gmail');
    expect(params.get('dest')).toBe('Slack');
    expect(restoreChartSelections(existing, ['Slack'], {})).toEqual(existing);
  });

  it('removes persisted selections and allows them to be re-added without duplicates', () => {
    const removed = removeGuestChartApp(new URLSearchParams('dest=Slack'), 'Slack');
    const readded = addChartSelection(removed, 'right', 'Slack');
    expect(readded.get('hidden_apps')).toBeNull();
    expect(addChartSelection(readded, 'right', 'slack').get('dest')).toBe('Slack');
  });
  it('removes a guest selection from both sides without requiring sign-in', () => {
    const result = removeGuestChartApp(new URLSearchParams('source=Slack,Gmail&dest=Slack,Jira'), 'slack');
    expect(result.get('source')).toBe('Gmail');
    expect(result.get('dest')).toBe('Jira');
    expect(result.get('hidden_apps')).toBe('slack');
  });

  it('keeps removed sample apps hidden after reconstructing chart state from the URL', () => {
    const result = removeGuestChartApp(new URLSearchParams('source=Slack'), 'Gmail');
    const restored = new URLSearchParams(result.toString());
    expect(restored.get('hidden_apps')?.split(',')).toContain('gmail');
    expect(restored.get('source')).toBe('Slack');
  });

  it('never allows Webhook removal by ID or name', () => {
    expect(canRemoveChartApp({ id: 'webhook-ingestion', name: 'Ingestion Webhook' })).toBe(false);
    expect(canRemoveChartApp({ id: '', name: 'Webhook' })).toBe(false);
    expect(canRemoveChartApp({ id: 'gmail-id', name: 'Gmail' })).toBe(true);
    expect(removeGuestChartApp(new URLSearchParams('source=Slack'), 'Webhook').toString()).toBe('source=Slack');
  });

  it('adds the chosen app directly using its canonical catalog ID', () => {
    const nodes = addSelectedChartApp([], { id: 'gmail-catalog-id', name: 'Gmail', icon: 'gmail.png' });
    expect(nodes).toEqual([{ id: 'gmail-catalog-id', name: 'Gmail', icon: 'gmail.png', hasValidAuth: false, isActiveOnly: false }]);
  });

  it('does not invent authentication for a newly selected app', () => {
    const nodes = addSelectedChartApp([], { id: null, name: 'Gmail', icon: '' });
    expect(nodes[0]?.hasValidAuth).toBe(false);
    expect(nodes[0]?.id).toBe('');
  });

  it('keeps an existing app and its credential status without duplicating it', () => {
    const original = [{ id: 'tenant-id', name: 'Gmail', icon: '', hasValidAuth: true, isActiveOnly: false }];
    const nodes = addSelectedChartApp(original, { id: 'catalog-id', name: 'gmail', icon: 'gmail.png' });
    expect(nodes).toEqual([{ id: 'tenant-id', name: 'Gmail', icon: 'gmail.png', hasValidAuth: true, isActiveOnly: false }]);
    expect(original[0]?.icon).toBe('');
  });
});