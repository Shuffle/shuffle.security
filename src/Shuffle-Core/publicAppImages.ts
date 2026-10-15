/**
 * Static fallback images for well-known public apps.
 *
 * Used when the live app catalog lookup (Algolia `appsearch`) is unreachable
 * or rate-limited, so app icons still render. URLs point at the same public
 * `shuffle_public` bucket the catalog images come from.
 */

export const PUBLIC_APP_IMAGE_FALLBACK: Record<string, string> = {
  virustotal: 'https://storage.googleapis.com/shuffle_public/app_images/Virustotal_v3_7ea4a8ac1dbc114c3f67e1e47dd87cc4.png',
  crowdstrike: 'https://storage.googleapis.com/shuffle_public/app_images/CrowdStrike_bd16f4b274c456ebbe843290230f1199.png',
  crowdstrike_falcon: 'https://storage.googleapis.com/shuffle_public/app_images/CrowdStrike_bd16f4b274c456ebbe843290230f1199.png',
  abuseipdb: 'https://storage.googleapis.com/shuffle_public/app_images/AbuseIPDB_2be56b440bbc9794aa201de312db98c5.png',
  okta: 'https://storage.googleapis.com/shuffle_public/app_images/Okta_0966d65ac6271b084a0399d2bd97ef51.png',
  slack: 'https://storage.googleapis.com/shuffle_public/app_images/Slack_9a528623b378c8d8b9ba582e6ef92be1.png',
  jira: 'https://storage.googleapis.com/shuffle_public/app_images/Jira_eb0c5e572e14ac1140a8355ba93c0d76.png',
  gmail: 'https://storage.googleapis.com/shuffle_public/app_images/Gmail_794e51c3c1a8b24b89ccc573a3defc47.png',
  outlook: 'https://storage.googleapis.com/shuffle_public/app_images/Outlook_Office365_accdaaf2eeba6a6ed43b2efc0112032d.png',
  microsoft_defender: 'https://storage.googleapis.com/shuffle_public/app_images/Microsoft_365_Defender_29c926c37334c191666f6470caa05e1c.png',
  microsoft_teams: 'https://storage.googleapis.com/shuffle_public/app_images/Microsoft_Teams_59ba339ee8397a612301c37905156a5c.png',
  splunk: 'https://storage.googleapis.com/shuffle_public/app_images/Splunk_1995363ec370368ed05a2882ec0ea8fc.png',
  elasticsearch: 'https://storage.googleapis.com/shuffle_public/app_images/Elasticsearch_971706758e274c2e4083f2621fb5a6f7.png',
  wazuh: 'https://storage.googleapis.com/shuffle_public/app_images/Wazuh_fb715a176a192620c25d49ba119e94e5.png',
  sentinelone: 'https://storage.googleapis.com/shuffle_public/app_images/SentinelOne_0373ed696a3a2cba0a2b6838068f2b80.png',
  carbon_black: 'https://storage.googleapis.com/shuffle_public/app_images/Carbon_Black_Response_e9fa2602ea6baafffa4b5eec722095d3.png',
  servicenow: 'https://storage.googleapis.com/shuffle_public/app_images/Servicenow_b9c2feaf99b6309dabaeaa8518c61d3d.png',
  thehive: 'https://storage.googleapis.com/shuffle_public/app_images/TheHive_7b0b20f198b28bcd6e7e3d2e7c1d84af.png',
  pagerduty: 'https://storage.googleapis.com/shuffle_public/app_images/Pagerduty_7a37a91176bc5ee845a7ee46d03dcbbe.png',
  qualys: 'https://storage.googleapis.com/shuffle_public/app_images/Qualys_792dbba1bb886bfe2cb08a798544d673.png',
  tenable: 'https://storage.googleapis.com/shuffle_public/app_images/Tenable_io_771804f54e195725da95ce70e0f2f01f.png',
  snyk: 'https://storage.googleapis.com/shuffle_public/app_images/Snyk_29227f6a73c09b69b3f36a8d052a5127.png',
};

/** Normalizes an app name or slug the same way tool names are keyed. */
const normalize = (s: string): string =>
  (s || '').toLowerCase().trim().replace(/[\s-]+/g, '_');

/** Best-known public image for an app name, or '' when not covered. */
export const publicAppImage = (nameOrSlug: string): string =>
  PUBLIC_APP_IMAGE_FALLBACK[normalize(nameOrSlug)] || '';
