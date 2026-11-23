// @vitest-environment happy-dom
/**
 * Render-level checks for the ApiCallViewer header: the snippet tabs and when
 * the Test button is available.
 */
import { afterEach, describe, expect, it } from 'vitest';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ApiCallViewer from './ApiCallViewer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const CONFIG = {
  method: 'POST',
  url: 'https://shuffle.security/api/v1/incidents',
  headers: { 'Content-Type': 'application/json' },
  body: { title: 'Ransomware detected', severity: 'critical' },
};

const roots: Root[] = [];

function renderViewer() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => {
    root.render(React.createElement(ApiCallViewer, { config: CONFIG, title: 'API Call' }));
  });
  return host;
}

function leafByText(host: HTMLElement, text: string) {
  return [...host.querySelectorAll('div,span')].find(
    (el) => el.childElementCount === 0 && (el.textContent || '').trim() === text,
  ) as HTMLElement | undefined;
}

function testButton(host: HTMLElement) {
  return [...host.querySelectorAll('button')].find(
    (b) => (b.textContent || '').trim() === 'Test',
  ) as HTMLButtonElement | undefined;
}

afterEach(() => {
  while (roots.length) {
    const root = roots.pop()!;
    act(() => root.unmount());
  }
  document.body.innerHTML = '';
});

describe('ApiCallViewer header tabs', () => {
  it('offers only cURL, Python and HTTP as snippet tabs', () => {
    const host = renderViewer();
    expect(leafByText(host, 'cURL')).toBeTruthy();
    expect(leafByText(host, 'Python')).toBeTruthy();
    expect(leafByText(host, 'HTTP')).toBeTruthy();
    expect(leafByText(host, 'JSON')).toBeFalsy();
  });

  it('keeps Test available on cURL and disables it on HTTP', () => {
    const host = renderViewer();
    const curlTest = testButton(host);
    expect(curlTest).toBeTruthy();
    expect(curlTest!.disabled).toBe(false);

    const httpTab = leafByText(host, 'HTTP')!;
    act(() => {
      httpTab.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const httpTest = testButton(host);
    expect(httpTest).toBeTruthy();
    expect(httpTest!.disabled).toBe(true);
  });
});
