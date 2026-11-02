import { describe, expect, it } from 'vitest';
import {
  buildOrborusDeployCommand,
  enrichOrborusDeployMarkdown,
} from './orborusDeployCommand';

describe('buildOrborusDeployCommand', () => {
  it('constructs a complete Linux/macOS command with org_id, queue, check flags, and Auth header when credentials are provided', () => {
    const cmd = buildOrborusDeployCommand('linux', {
      baseUrl: 'https://shuffler.io',
      queue: 'prod-monitors',
      orgId: 'org-1234',
      auth: 'auth-secret-5678',
    });

    expect(cmd).toBe(
      "curl 'https://shuffler.io/api/v1/orborus?base_url=https://shuffler.io&sensor_mode=true&queue=prod-monitors&org_id=org-1234&software_list_enabled=true&hd_encrypted_check=true&screenlock_check=true&code_scanner_enabled=true&response_actions=full&log_forwarding=false' -H 'Auth: auth-secret-5678' | sh",
    );
  });

  it('uses explicit placeholders when unauthenticated / credentials are omitted', () => {
    const cmd = buildOrborusDeployCommand('linux', {
      baseUrl: 'https://shuffler.io',
    });

    expect(cmd).toContain('base_url=https://shuffler.io');
    expect(cmd).toContain('sensor_mode=true');
    expect(cmd).toContain('queue=default_monitors');
    expect(cmd).toContain('org_id=<ORG_ID>');
    expect(cmd).toContain("-H 'Auth: <AUTH_KEY>' | sh");
  });

  it('constructs a complete Windows PowerShell command with Headers and os=windows', () => {
    const cmd = buildOrborusDeployCommand('windows', {
      baseUrl: 'https://shuffler.io',
      queue: 'win-monitors',
      orgId: 'org-999',
      auth: 'win-auth-token',
    });

    expect(cmd).toBe(
      `powershell -ExecutionPolicy Bypass -Command "& {iex (irm 'https://shuffler.io/api/v1/orborus?base_url=https://shuffler.io&sensor_mode=true&queue=win-monitors&org_id=org-999&software_list_enabled=true&hd_encrypted_check=true&screenlock_check=true&code_scanner_enabled=true&response_actions=full&log_forwarding=false&os=windows' -Headers @{'Auth'='win-auth-token'})}"`,
    );
  });
});

describe('enrichOrborusDeployMarkdown', () => {
  it('upgrades bare curl and powershell sensor_mode commands in documentation markdown', () => {
    const rawMarkdown = [
      '# Host Monitoring',
      '```bash',
      "curl -sSL 'https://shuffler.io/api/v1/orborus?sensor_mode=true' | bash",
      '```',
      '```bash',
      "curl -sSL 'https://shuffler.io/api/v1/orborus?sensor_mode=true&os=darwin' | sudo bash",
      '```',
      '```powershell',
      `powershell -ExecutionPolicy Bypass -Command "& {iex (irm 'https://shuffler.io/api/v1/orborus?sensor_mode=true&os=windows')}"`,
      '```',
    ].join('\n');

    const enriched = enrichOrborusDeployMarkdown(rawMarkdown, {
      baseUrl: 'https://shuffler.io',
      queue: 'default_monitors',
      orgId: 'org-abc',
      auth: 'auth-xyz',
    });

    expect(enriched).not.toContain(
      "curl -sSL 'https://shuffler.io/api/v1/orborus?sensor_mode=true' | bash",
    );
    expect(enriched).toContain(
      "curl 'https://shuffler.io/api/v1/orborus?base_url=https://shuffler.io&sensor_mode=true&queue=default_monitors&org_id=org-abc&software_list_enabled=true&hd_encrypted_check=true&screenlock_check=true&code_scanner_enabled=true&response_actions=full&log_forwarding=false' -H 'Auth: auth-xyz' | sh",
    );
    expect(enriched).toContain(
      `powershell -ExecutionPolicy Bypass -Command "& {iex (irm 'https://shuffler.io/api/v1/orborus?base_url=https://shuffler.io&sensor_mode=true&queue=default_monitors&org_id=org-abc&software_list_enabled=true&hd_encrypted_check=true&screenlock_check=true&code_scanner_enabled=true&response_actions=full&log_forwarding=false&os=windows' -Headers @{'Auth'='auth-xyz'})}"`,
    );
  });

  it('leaves commands that already specify org_id and queue untouched', () => {
    const existing =
      "curl 'https://shuffler.io/api/v1/orborus?base_url=https://shuffler.io&sensor_mode=true&queue=custom_q&org_id=custom_org' -H 'Auth: custom_auth' | sh";
    expect(
      enrichOrborusDeployMarkdown(existing, {
        baseUrl: 'https://shuffler.io',
        queue: 'default_monitors',
        orgId: 'org-abc',
        auth: 'auth-xyz',
      }),
    ).toBe(existing);
  });
});
