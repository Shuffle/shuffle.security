# Shuffle Security Usecases API Test System

This document outlines the architecture, setup, and usage of the automated API test harness for the 16 active usecases on `/usecases`.

## Overview

The test runner (`scripts/test_usecases_api.py`) evaluates the operational integrity of all active usecases using strictly REST API interactions:
1. Validates workflow generation and trigger schemas via `/api/v2/workflows/generate`.
2. Inspects and validates Datastore Category Automations (`shuffle-security_incidents`, `shuffle-security_vulns`, `shuffle-security_packages`).
3. Ingests synthetic security payloads through webhooks, direct workflow executions, and datastore cache injections.
4. Asserts that ingested alerts, CVEs, IOCs, and host sensors are processed and accessible in `list_cache`.
5. Executes automated cleanup to ensure idempotent, repeatable runs.

---

## Active Usecases Covered (16 Total)

| Usecase ID | Name | Operational Phase | Ingestion / Automation Channel | Validation Target |
|---|---|---|---|---|
| `siem_case_management_1` | SIEM alerts | Ingestion | Webhook (`/api/v1/hooks/webhook_*`) | `shuffle-security_incidents` |
| `edr_case_management_1` | EDR alerts | Ingestion | Webhook (`/api/v1/hooks/webhook_*`) | `shuffle-security_incidents` |
| `email_case_management_1` | Email reports | Ingestion | Webhook (`/api/v1/hooks/webhook_*`) | `shuffle-security_incidents` |
| `threat_intel_ingest_1` | IOC feeds | Ingestion | Scheduled feed sync / cache write | `ioc_ipv4_addr`, `ioc_domain` |
| `threat_intel_case_management_1` | Enrichment | Correlation | Webhook trigger on observables | `shuffle-security_incidents` (`enrichments`) |
| `case_management_cases_forward_1` | Forward Tickets | Response | Category automation hook (`Run workflow`) | Datastore automations on incidents |
| `case_management_communication_1` | Notifications | Response | Org notification pointer | `org.defaults.notification_workflow` |
| `case_management_asset_management_monitors_1` | Host Monitoring | Ingestion | Agent heartbeat sensor | `shuffle-security_sensors` |
| `case_management_assign_escalate_1` | Assign & Escalate | Response | Category automation hook (`Run workflow`) | Datastore automations on incidents |
| `asset_management_case_management_vuln_1` | Vulnerability Correlation | Correlation | Package injection / OSV script | `shuffle-security_packages` & `shuffle-security_vulns` |
| `vulnerability_ingestion_1` | Vulnerability Ingestion | Ingestion | Webhook (`vulnerabilities_webhook`) | `shuffle-security_vulns` |
| `threat_intel_network_1` | IOC feeds (Network) | Response | Feed sync / firewall block action | Datastore cache |
| `threat_intel_edr_1` | IOC feeds (EDR) | Response | Feed sync / EDR blocklist action | Datastore cache |
| `case_management_incident_routing_1` | Incident Routing Rules | Response | Category automation hook (`Run workflow`) | `shuffle-security_incidents` |
| `case_management_schedules_notifications_1` | Schedules & Phone Notifications | Response | Category automation hook (`Run workflow`) | `shuffle-security_incidents` |
| `case_management_agent_ai_incident_handling_1` | AI Incident Handling | Response | Category automation hook (`Run AI Agent`) | `shuffle-security_incidents` (`@AIAgent` activity) |

---

## Running the Test Suite

### Prerequisites

* Python 3.9+
* Standard libraries (`urllib`, `json`) or `requests` (`pip install requests`)

### Command-Line Usage

#### 1. List Available Usecase Tests
```bash
python3 scripts/test_usecases_api.py --list
```

#### 2. Run All 16 Usecases Against Local Shuffle (default: http://localhost:3001)
```bash
python3 scripts/test_usecases_api.py --all
```

#### 3. Run With Authentication (API Key or Credentials)
```bash
python3 scripts/test_usecases_api.py --all --api-key <YOUR_API_KEY> --url https://your-shuffle-instance.com
```
Or with session credentials:
```bash
python3 scripts/test_usecases_api.py --all --username admin --password secret
```

#### 4. Run a Specific Usecase
```bash
python3 scripts/test_usecases_api.py --usecase vulnerability_ingestion_1
```

#### 5. Run Usecases by Phase
```bash
# Ingestion phase only
python3 scripts/test_usecases_api.py --phase ingestion

# Correlation phase only
python3 scripts/test_usecases_api.py --phase correlation

# Response phase only
python3 scripts/test_usecases_api.py --phase response
```

#### 6. Retain Workflows & Data for UI Inspection (No Teardown)
```bash
python3 scripts/test_usecases_api.py --usecase siem_case_management_1 --no-teardown
```

#### 7. Generate Machine-Readable JSON Report for CI/CD
```bash
python3 scripts/test_usecases_api.py --all --json-report test-report.json
```

---

## Output Example

```
--------------------------------------------------------------------------------
USECASE ID                       | NAME                             | STATUS     | DURATION  
--------------------------------------------------------------------------------
siem_case_management_1           | SIEM alerts                      | [PASSED]   | 0.412s    
edr_case_management_1            | EDR alerts                       | [PASSED]   | 0.320s    
email_case_management_1          | Email reports                    | [PASSED]   | 0.315s    
threat_intel_ingest_1            | IOC feeds                        | [PASSED]   | 0.288s    
threat_intel_case_management_1   | Enrichment                       | [PASSED]   | 0.295s    
case_management_cases_forward_1  | Forward Tickets                  | [PASSED]   | 0.354s    
case_management_communication_1  | Notifications                    | [PASSED]   | 0.311s    
case_management_asset_management | Host Monitoring                  | [PASSED]   | 0.198s    
case_management_assign_escalate_ | Assign & Escalate                | [PASSED]   | 0.340s    
asset_management_case_management | Vulnerability Correlation        | [PASSED]   | 0.380s    
vulnerability_ingestion_1        | Vulnerability Ingestion          | [PASSED]   | 0.372s    
threat_intel_network_1           | IOC feeds (Network)              | [PASSED]   | 0.290s    
threat_intel_edr_1               | IOC feeds (EDR)                  | [PASSED]   | 0.285s    
case_management_incident_routing | Incident Routing Rules           | [PASSED]   | 0.334s    
case_management_schedules_notifi | Schedules & Phone Notifications  | [PASSED]   | 0.362s    
case_management_agent_ai_inciden | AI Incident Handling             | [PASSED]   | 0.405s    
--------------------------------------------------------------------------------
Total: 16 | Passed: 16 | Failed: 0 | Skipped: 0
```
