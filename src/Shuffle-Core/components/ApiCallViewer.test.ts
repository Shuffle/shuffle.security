import { describe, expect, it } from 'vitest';
import {
  buildCurl,
  buildHttp,
  buildPython,
  unmaskSnippetCredentials,
} from './ApiCallViewer';

describe('ApiCallViewer snippet builders', () => {
  it('generates compact Python without blank lines or Unicode ellipsis characters', () => {
    const py = buildPython(
      'POST',
      'https://uk.shuffle.security/api/v1/agent',
      { Authorization: 'Bearer 2f5bfb7a-1111-2222-3333-444444444444' },
      {
        method: 'tools/call',
        params: {
          stream: false,
          extra: null,
        },
      },
      true,
    );

    expect(py).not.toContain('\u2026');
    expect(py).not.toContain('\n\n');
    expect(py).toBe(
      [
        'import requests',
        'url = "https://uk.shuffle.security/api/v1/agent"',
        'headers = {"Authorization": "Bearer 2f5bfb7a..."}',
        'payload = {',
        '  "method": "tools/call",',
        '  "params": {',
        '    "stream": False,',
        '    "extra": None',
        '  }',
        '}',
        'response = requests.request("POST", url, headers=headers, json=payload)',
        'print(response.json())',
      ].join('\n'),
    );
  });

  it('never emits Unicode ellipsis in cURL or HTTP masked headers', () => {
    const headers = { Authorization: 'Bearer 2f5bfb7a-1111-2222-3333-444444444444' };
    const curl = buildCurl('GET', 'https://uk.shuffle.security/api/v1/me', headers, null, true);
    const http = buildHttp('GET', 'https://uk.shuffle.security/api/v1/me', headers, null, true);

    expect(curl).toContain("Authorization: Bearer 2f5bfb7a...");
    expect(curl).not.toContain('\u2026');
    expect(http).toContain('Authorization: Bearer 2f5bfb7a...');
    expect(http).not.toContain('\u2026');
  });

  it('unmasks edited snippets containing ASCII or Unicode ellipsis masks back to the real token', () => {
    const fullToken = '2f5bfb7a-1111-2222-3333-444444444444';
    const editedWithUnicodeEllipsis =
      'headers = {"Authorization": "Bearer 2f5bfb7a\u2026"}';
    const editedWithAsciiDots =
      'headers = {"Authorization": "Bearer 2f5bfb7a..."}';

    expect(
      unmaskSnippetCredentials(editedWithUnicodeEllipsis, fullToken, '2f5bfb7a...'),
    ).toBe(`headers = {"Authorization": "Bearer ${fullToken}"}`);

    expect(
      unmaskSnippetCredentials(editedWithAsciiDots, fullToken, '2f5bfb7a...'),
    ).toBe(`headers = {"Authorization": "Bearer ${fullToken}"}`);
  });

  it('sanitizes stray Unicode ellipsis characters even when unauthenticated', () => {
    const raw = 'headers = {"Authorization": "Bearer 2f5bfb7a\u2026"}';
    const sanitized = unmaskSnippetCredentials(raw, null);
    expect(sanitized).not.toContain('\u2026');
    expect(sanitized).toBe('headers = {"Authorization": "Bearer 2f5bfb7a..."}');
  });
});
