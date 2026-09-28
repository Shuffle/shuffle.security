import {
  buildIncidentSearchBlob,
  getIncidentSearchBlob,
  matchIncidentSearchText,
  toRawIncidentKey,
  NOISE_CORRELATION_KEYS,
  type SearchableIncident,
} from './src/lib/incidentSearch.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAILED: ${msg}`);
    process.exit(1);
  }
  console.log(`PASSED: ${msg}`);
}

// Test 1: toRawIncidentKey
assert(toRawIncidentKey('incident-123') === 'incident-123', 'toRawIncidentKey standard id');
assert(toRawIncidentKey('org-1::category::incident-456') === 'incident-456', 'toRawIncidentKey namespaced ::');
assert(toRawIncidentKey('shuffle-security_incidents|incident-789') === 'incident-789', 'toRawIncidentKey pipe |');
assert(toRawIncidentKey('category/sub/incident-999') === 'incident-999', 'toRawIncidentKey slash /');

// Test 2: Multi-field blob extraction
const sampleIncident: SearchableIncident = {
  id: 'inc-001',
  title: 'Suspicious PowerShell execution on endpoint',
  source: 'CrowdStrike Falcon',
  severity: 'high',
  status: 'in_progress',
  assignee: 'Alice Smith',
  tlp: 'TLP:AMBER',
  labels: ['powershell', 'malware', 'lateral_movement'],
  orgName: 'Acme Corp',
  orgId: 'org-acme',
  observables: [
    { type: 'ipv4', value: '198.51.100.24' },
    { type: 'domain', value: 'evil-command-and-control.xyz' },
    { type: 'sha256', value: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  ],
  tasks: [
    { id: 'task-1', title: 'Isolate compromised workstation', assignee: 'Bob Jones' },
  ],
  references: ['https://attack.mitre.org/techniques/T1059/001/', 'CVE-2024-3400'],
  rawOCSF: {
    class_uid: 2005,
    class_name: 'Incident Finding',
    desc: 'An encoded PowerShell script attempted to bypass AMSI and establish a reverse shell.',
    message: 'Host-based detection alert on DC-01.',
    finding_uid: 'f-uid-999',
    analytic: { name: 'AMSI Bypass via Memory Patching' },
    email: {
      subject: 'Urgent: Wire transfer invoice attached',
      from: 'attacker@spoofed-vendor.com',
      to: ['cfo@acme.corp'],
    },
    device: { hostname: 'FIN-WS-004', ip: '10.0.4.12' },
    metadata: {
      extensions: {
        custom_attributes: {
          external_id: 'SERVICENOW-INC98765',
        },
      },
    },
  },
};

const blob = getIncidentSearchBlob(sampleIncident);

// Verify fields in blob
assert(blob.includes('inc-001'), 'Blob contains ID');
assert(blob.includes('powershell execution'), 'Blob contains title');
assert(blob.includes('crowdstrike falcon'), 'Blob contains source');
assert(blob.includes('alice smith'), 'Blob contains assignee');
assert(blob.includes('in progress'), 'Blob contains friendly status');
assert(blob.includes('tlp:amber'), 'Blob contains TLP');
assert(blob.includes('lateral_movement'), 'Blob contains labels');
assert(blob.includes('acme corp'), 'Blob contains orgName');
assert(blob.includes('198.51.100.24'), 'Blob contains observable IP');
assert(blob.includes('evil-command-and-control.xyz'), 'Blob contains observable domain');
assert(blob.includes('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'), 'Blob contains observable SHA256');
assert(blob.includes('isolate compromised workstation'), 'Blob contains task title');
assert(blob.includes('bob jones'), 'Blob contains task assignee');
assert(blob.includes('cve-2024-3400'), 'Blob contains reference CVE');
assert(blob.includes('encoded powershell script attempted to bypass amsi'), 'Blob contains description');
assert(blob.includes('amsi bypass via memory patching'), 'Blob contains analytic name');
assert(blob.includes('urgent: wire transfer invoice attached'), 'Blob contains email subject');
assert(blob.includes('attacker@spoofed-vendor.com'), 'Blob contains email sender');
assert(blob.includes('fin-ws-004'), 'Blob contains device hostname');
assert(blob.includes('servicenow-inc98765'), 'Blob contains external_id');

// Test 3: Multi-token search matching
assert(matchIncidentSearchText(sampleIncident, ['powershell', 'high']), 'Multi-token match: powershell AND high');
assert(matchIncidentSearchText(sampleIncident, ['198.51.100.24']), 'Match: observable IP');
assert(matchIncidentSearchText(sampleIncident, ['wire', 'transfer', 'bob']), 'Multi-token match: email + task assignee');
assert(!matchIncidentSearchText(sampleIncident, ['powershell', 'ransomware_not_present']), 'Multi-token failure on missing token');

// Test 4: Noise keys
assert(NOISE_CORRELATION_KEYS.has('new'), 'Noise key: new');
assert(NOISE_CORRELATION_KEYS.has('in_progress'), 'Noise key: in_progress');
assert(NOISE_CORRELATION_KEYS.has('true'), 'Noise key: true');

console.log('All tests passed successfully!');
