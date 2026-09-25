# Shuffle Security Usecase API Test System

This document explains what the test runner (`test_usecases_api.py`) does from start to finish, and breaks down the test for each of the 16 active usecases in simple, direct language.

---

## What the Test Runner Does From Start to Finish

When you run `python3 scripts/test_usecases_api.py --all`, the script performs a 5-step lifecycle for every active usecase:

```
[1. Connect & Auth] ---> [2. Turn On Feature] ---> [3. Send Mock Data] ---> [4. Verify Result] ---> [5. Clean Up]
```

### Step 1: Connect and Authenticate
* The runner contacts the Shuffle backend (e.g. `http://localhost:3001` or your remote Shuffle URL).
* It authenticates using your API key (`--api-key`) or username and password (`--username`, `--password`).
* It retrieves your user profile and identifies your active organization ID (`active_org_id`).

### Step 2: Turn On the Feature via API
* Instead of clicking "Enable" in the web browser, the script calls `POST /api/v2/workflows/generate` (or `/api/v2/datastore/automate`).
* It checks that the backend returns an HTTP 200 status code and gives back a valid workflow ID.
* It verifies that any necessary category hooks were added (for instance, telling the `shuffle-security_incidents` datastore category to run this workflow whenever an incident is created).

### Step 3: Send Realistic Mock Data
* The script feeds simulated security data into Shuffle through the exact same channel a real tool would use:
  * For SIEM, EDR, and Email, it sends an alert payload directly to the generated Webhook URL (`POST /api/v1/hooks/webhook_<id>`).
  * For Threat Intel, it writes an IP or domain indicator into the IOC cache (`POST /api/v1/orgs/<orgId>/cache`).
  * For Vulnerabilities, it sends a CVE report with package and asset information.
  * For AI Handling, it triggers a test incident that requests an automated AI triage response.

### Step 4: Verify That Shuffle Processed the Data
* The script queries the Shuffle backend datastore cache (`GET /api/v1/orgs/<orgId>/list_cache`).
* It checks whether the incident, CVE, indicator, or sensor was correctly stored, parsed, and tagged.
* If the data is found and properly formatted, the test marks the usecase as `PASSED`. If not, or if an API returns an error, it marks it as `FAILED`.

### Step 5: Clean Up (Teardown)
* Unless you pass the `--no-teardown` flag, the script sends an API call with `action_name: "remove"` to delete the generated workflow.
* It scrubs the workflow ID from the datastore category automations so your environment is left clean and ready for future runs.
* Finally, it prints an ASCII summary table showing the duration and result of each test.

---

## Simple Breakdown of Each Usecase Test

Here is what happens under the hood for each of the 16 usecases:

### 1. SIEM Alerts (`siem_case_management_1`)
* **What it does**: Ingests security alerts from SIEM tools (such as Wazuh, Splunk, or Elastic) into Shuffle Cases.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Ingest Tickets"` and `category: "siem"`.
* **Mock data sent**: A simulated alert JSON describing a suspicious PowerShell execution on a production worker server.
* **How it confirms it worked**: Queries `list_cache` under `shuffle-security_incidents` and verifies that the incident exists with `source_tool: "Test_SIEM"`.
* **Clean up**: Removes the "Ingest Tickets" workflow and cleans up the datastore entry.

### 2. EDR Alerts (`edr_case_management_1`)
* **What it does**: Ingests endpoint detection alerts (from tools like CrowdStrike, SentinelOne, or Defender) into Shuffle Cases.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Ingest Tickets"` and `category: "edr"`.
* **Mock data sent**: A simulated alert containing a CobaltStrike beacon detection on a Windows 11 endpoint.
* **How it confirms it worked**: Checks `shuffle-security_incidents` in `list_cache` for an incident with `source_tool: "Test_EDR"`.
* **Clean up**: Removes the workflow and test incident.

### 3. Email Reports (`email_case_management_1`)
* **What it does**: Parses user-reported phishing or suspicious emails and turns them into cases for triage.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Ingest Tickets"` and `category: "email"`.
* **Mock data sent**: A simulated phishing report with subject "Urgent invoice request" and a suspicious sender address.
* **How it confirms it worked**: Verifies an incident exists in `shuffle-security_incidents` with `source_tool: "Test_Email"`.
* **Clean up**: Deletes the workflow and cleans test incident cache.

### 4. IOC Feeds (`threat_intel_ingest_1`)
* **What it does**: Pulls threat intelligence indicator feeds (malicious IPs, domains, hashes) on a recurring schedule.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Enable Threat feeds"` and `category: "threat_intel"`.
* **Mock data sent**: Injects an IP indicator (`198.51.100.99`) with threat type `c2` and confidence `95`.
* **How it confirms it worked**: Queries `list_cache` under `ioc_ipv4_addr` and asserts that `198.51.100.99` is stored in the cache.
* **Clean up**: Deletes the threat feeds workflow.

### 5. Enrichment (`threat_intel_case_management_1`)
* **What it does**: Automatically takes observables from incoming incidents (IPs, hashes, URLs) and looks them up against threat intel feeds.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Enable Threat feeds_webhook"`.
* **Mock data sent**: Verifies that the webhook trigger workflow is generated and registered.
* **How it confirms it worked**: Confirms that the enrichment workflow was successfully built and returned an HTTP 200.
* **Clean up**: Removes the enrichment workflow.

### 6. Forward Tickets (`case_management_cases_forward_1`)
* **What it does**: Automatically forwards cases or incidents from Shuffle to external ticketing systems (like Jira, ServiceNow, or GitHub Issues).
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Forward Tickets"`.
* **Mock data sent**: Tests the generation of the forwarding workflow and inspects category hooks.
* **How it confirms it worked**: Inspects `shuffle-security_incidents` category settings to confirm that the `Run workflow` automation contains the new workflow ID.
* **Clean up**: Removes the forwarding workflow and scrubs its ID from datastore automations.

### 7. Notifications (`case_management_communication_1`)
* **What it does**: Sends alert broadcasts to communication platforms (Slack, Microsoft Teams, Discord, or Email) when new incidents arrive.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Notifications"`.
* **Mock data sent**: Queries organization defaults after creation.
* **How it confirms it worked**: Queries `GET /api/v1/orgs/<orgId>` and checks that `org.defaults.notification_workflow` matches the newly generated workflow ID.
* **Clean up**: Removes the notification workflow and resets `org.defaults.notification_workflow` to empty.

### 8. Host Monitoring (`case_management_asset_management_monitors_1`)
* **What it does**: Tracks agent heartbeats and health metrics from monitored servers and endpoints.
* **How the test turns it on**: Ingests a host sensor record into the `shuffle-security_sensors` datastore category.
* **Mock data sent**: A sensor heartbeat with hostname `test-srv-host01`, status `online`, and current timestamp.
* **How it confirms it worked**: Queries `list_cache` for `shuffle-security_sensors` and asserts the sensor is visible.
* **Clean up**: Automatically kept or purged based on teardown settings.

### 9. Assign & Escalate (`case_management_assign_escalate_1`)
* **What it does**: Analyzes incoming incident severity, checks responder schedules, assigns the ticket, and pages the on-call analyst.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Assign & Escalate"`.
* **Mock data sent**: Generates the escalation workflow and hooks it into incident creation.
* **How it confirms it worked**: Confirms workflow creation and verifies that the `Run workflow` hook is attached to `shuffle-security_incidents`.
* **Clean up**: Removes the workflow and unhooks it from the category automations.

### 10. Vulnerability Correlation (`asset_management_case_management_vuln_1`)
* **What it does**: Matches software packages installed on your assets against known CVE databases (such as OSV or NVD) to surface vulnerabilities.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Vulnerability Correlation"`.
* **Mock data sent**: Ingests a software package record (`openssl` version `1.1.1` on Debian) into `shuffle-security_packages`.
* **How it confirms it worked**: Verifies the correlation workflow was successfully created and linked to package updates.
* **Clean up**: Deletes the correlation workflow.

### 11. Vulnerability Ingestion (`vulnerability_ingestion_1`)
* **What it does**: Accepts direct vulnerability scan reports from scanners (Tenable, Qualys, Snyk, Trivy) via webhook.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Ingest Vulnerabilities"`.
* **Mock data sent**: A vulnerability record with a CVE ID, severity `critical`, CVSS score `9.8`, and status `open`.
* **How it confirms it worked**: Queries `list_cache` under `shuffle-security_vulns` and asserts the CVE record exists.
* **Clean up**: Deletes the ingestion workflow and purges the test CVE from cache.

### 12. Threat Intel - Network (`threat_intel_network_1`)
* **What it does**: Syncs malicious IP indicators with network perimeter firewalls and edge devices (Palo Alto, Fortinet, Cloudflare) to block threats.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Enable Threat feeds"` for network targets.
* **Mock data sent**: Feed sync action targeting network enforcement.
* **How it confirms it worked**: Verifies the backend returns HTTP 200 and a valid network feed sync workflow ID.
* **Clean up**: Removes the workflow.

### 13. Threat Intel - EDR (`threat_intel_edr_1`)
* **What it does**: Pushes malicious hashes and domains directly to EDR consoles to block execution across workstations and servers.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Enable Threat feeds"` for EDR targets.
* **Mock data sent**: Feed sync action targeting endpoint enforcement.
* **How it confirms it worked**: Verifies that the EDR feed sync workflow was created with HTTP 200.
* **Clean up**: Removes the workflow.

### 14. Incident Routing Rules (`case_management_incident_routing_1`)
* **What it does**: Evaluates conditions on incoming alerts (e.g. VIP user, production environment, high severity) and routes them to the right team queue.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Incident Routing Rules"`.
* **Mock data sent**: Generates the routing evaluation workflow and registers it with the incidents category.
* **How it confirms it worked**: Checks `shuffle-security_incidents` category settings to confirm the routing workflow is registered.
* **Clean up**: Deletes the workflow and cleans up datastore hooks.

### 15. Schedules & Phone Notifications (`case_management_schedules_notifications_1`)
* **What it does**: Checks responder on-call schedules and triggers high-urgency phone calls or SMS notifications for P1 incidents.
* **How the test turns it on**: Calls `POST /api/v2/workflows/generate` with `label: "Schedules & Phone Notifications"`.
* **Mock data sent**: Generates the phone notification workflow.
* **How it confirms it worked**: Confirms that `HandleSingulWorkflowEnablement` hooked the workflow into `shuffle-security_incidents` datastore automations.
* **Clean up**: Removes the workflow and removes its ID from the datastore category.

### 16. AI Incident Handling (`case_management_agent_ai_incident_handling_1`)
* **What it does**: Uses the Shuffle AI Agent to automatically investigate incoming alerts, summarize telemetry, and suggest triage actions.
* **How the test turns it on**: Calls `POST /api/v2/datastore/automate` with `name: "Run AI Agent"` and `enabled: true`.
* **Mock data sent**: Ingests an incident into `shuffle-security_incidents` containing an `@AIAgent` activity message.
* **How it confirms it worked**: Verifies that the automation is active on `shuffle-security_incidents` and that the incident triage entry is stored.
* **Clean up**: Calls `POST /api/v2/datastore/automate` with `enabled: false` to return the environment to its initial state.

---

## Quick Reference Commands

```bash
# 1. View all 16 test cases
python3 scripts/test_usecases_api.py --list

# 2. Run all tests against your local Shuffle instance
python3 scripts/test_usecases_api.py --all

# 3. Test a specific usecase
python3 scripts/test_usecases_api.py --usecase siem_case_management_1

# 4. Test only ingestion usecases
python3 scripts/test_usecases_api.py --phase ingestion

# 5. Keep workflows and data intact for inspection in the UI
python3 scripts/test_usecases_api.py --usecase vulnerability_ingestion_1 --no-teardown

# 6. Save results to JSON for CI/CD pipelines
python3 scripts/test_usecases_api.py --all --json-report report.json
```
