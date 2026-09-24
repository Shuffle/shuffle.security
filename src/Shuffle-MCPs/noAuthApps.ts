import shuffleLogoImg from '@/assets/shuffle-logo.png';
import singulAgentIconImg from '@/assets/singul-agent-icon.png';

/**
 * Single source of truth for "which apps never require authentication".
 *
 * Shuffle's own internal apps (Shuffle Workflows, Shuffle Workflows Builder,
 * Shuffle Incidents, Shuffle Datastore, ...) ride on the user's existing
 * Shuffle session, so they must never ask for credentials — neither in the
 * Agent area (/agents) nor in the "App configuration" sidebar.
 *
 * Use `appRequiresAuthentication(name)` everywhere instead of ad-hoc lists.
 */

/** Normalise "Shuffle Host Monitors" / "shuffle-host-monitors" -> shuffle_host_monitors. */
export const normalizeAppName = (name: string) =>
  (name || '').toLowerCase().trim().replace(/[\s\-]+/g, '_');

/** Explicit no-auth apps that do not carry the "shuffle" prefix. */
export const NO_AUTH_APPS = new Set<string>([
  'shuffle_incidents',
  'shuffle_host_monitors',
  'shuffle_monitors',
  'shuffle_sensors',
  'shuffle_workflows',
  'shuffle_workflows_builder',
  'shuffle_datastore',
  'shuffle_apps',
  'shuffle_detection',
  'shuffle_files',
  'shuffles_app_management',
  'shuffle_tools',
  'shuffle_assets',
  'shuffle_software',
  'shuffle_packages',
  'shuffle_software_and_packages',
  'shuffle_vulnerabilities',
  'assets',
  'software',
  'packages',
  'software_and_packages',
  'vulnerabilities',
  'tools',
  'http',
  'singul',
  'core',
  'webhook',
  'email',
]);

/**
 * True when the app is a built-in Shuffle app that authenticates through the
 * user's session (any "Shuffle ..." app) or is in the explicit list above.
 */
export const isNoAuthApp = (name?: string | null): boolean => {
  if (!name) return false;
  const target = normalizeAppName(String(name));
  if (!target) return false;
  if (NO_AUTH_APPS.has(target)) return true;
  // Every internal Shuffle app ("shuffle_*" / "shuffles_*") is session-based.
  return /^shuffles?_/.test(target);
};

/** Inverse of `isNoAuthApp` — the predicate most call sites want. */
export const appRequiresAuthentication = (name?: string | null): boolean => !isNoAuthApp(name);

export interface BuiltInAppMetadata {
  name: string;
  displayName: string;
  description: string;
  image: string;
  categories: string[];
}

export const BUILT_IN_APP_METADATA: Record<string, Omit<BuiltInAppMetadata, 'name'>> = {
  shuffle_apps: {
    displayName: 'Shuffle Apps',
    description: 'Manage and configure apps, tools, and integrations across Shuffle.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Tools'],
  },
  shuffles_app_management: {
    displayName: 'Shuffle App Management',
    description: 'Manage and configure apps, tools, and integrations across Shuffle.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Tools'],
  },
  shuffle_workflows_builder: {
    displayName: 'Shuffle Workflows Builder',
    description: 'Designs and builds Shuffle workflows for you — pick apps, wire actions, and iterate on automations from a description.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Automation'],
  },
  shuffle_workflows: {
    displayName: 'Shuffle Workflows',
    description: 'Run, monitor, and manage automated Shuffle workflows.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Automation'],
  },
  shuffle_incidents: {
    displayName: 'Shuffle Incidents',
    description: 'Holistic incident investigation and response — triages alerts, closes false positives, escalates threats, and executes containment.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'SIEM / Case Management'],
  },
  shuffle_host_monitors: {
    displayName: 'Shuffle Host Monitors',
    description: 'Controls a host computer through the command line, with telemetry and host monitoring.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Endpoint / EDR'],
  },
  shuffle_monitors: {
    displayName: 'Shuffle Monitors',
    description: 'Host and infrastructure telemetry monitoring.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Endpoint / EDR'],
  },
  shuffle_sensors: {
    displayName: 'Shuffle Sensors',
    description: 'Endpoint sensors and telemetry collection for security detection.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Endpoint / EDR'],
  },
  shuffle_tools: {
    displayName: 'Shuffle Tools',
    description: 'Platform utilities for running diagnostics, navigating settings, and automating tasks.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Tools'],
  },
  tools: {
    displayName: 'Shuffle Tools',
    description: 'Platform utilities for running diagnostics, navigating settings, and automating tasks.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Tools'],
  },
  shuffle_vulnerabilities: {
    displayName: 'Shuffle Vulnerabilities',
    description: 'Vulnerability intelligence and management — demystifies CVEs, reviews affected packages, and guides remediation.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Vulnerabilities'],
  },
  vulnerabilities: {
    displayName: 'Shuffle Vulnerabilities',
    description: 'Vulnerability intelligence and management — demystifies CVEs, reviews affected packages, and guides remediation.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Vulnerabilities'],
  },
  shuffle_software_and_packages: {
    displayName: 'Shuffle Software and Packages',
    description: 'Software and package intelligence for vulnerability management and asset correlation.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Assets'],
  },
  software_and_packages: {
    displayName: 'Shuffle Software and Packages',
    description: 'Software and package intelligence for vulnerability management and asset correlation.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Assets'],
  },
  shuffle_software: {
    displayName: 'Shuffle Software',
    description: 'Software inventory and correlation across managed systems.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Assets'],
  },
  software: {
    displayName: 'Shuffle Software',
    description: 'Software inventory and correlation across managed systems.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Assets'],
  },
  shuffle_packages: {
    displayName: 'Shuffle Packages',
    description: 'Package intelligence and package-level vulnerability correlation.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Assets'],
  },
  packages: {
    displayName: 'Shuffle Packages',
    description: 'Package intelligence and package-level vulnerability correlation.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Assets'],
  },
  shuffle_assets: {
    displayName: 'Shuffle Assets',
    description: 'Asset inventory, discovery, and posture tracking across cloud and on-premise environments.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Assets'],
  },
  assets: {
    displayName: 'Shuffle Assets',
    description: 'Asset inventory, discovery, and posture tracking across cloud and on-premise environments.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Assets'],
  },
  shuffle_detection: {
    displayName: 'Shuffle Detection',
    description: 'Creates and tunes detection rules (Sigma, pipelines), filters false positives, and validates coverage.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Detection'],
  },
  shuffle_datastore: {
    displayName: 'Shuffle Datastore',
    description: 'Persistent key-value data storage and state management for Shuffle workflows.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Data'],
  },
  shuffle_files: {
    displayName: 'Shuffle Files',
    description: 'File handling, storage, and transfers within Shuffle workflows.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Files'],
  },
  shuffle_security: {
    displayName: 'Shuffle Security',
    description: 'Shuffle Security orchestration, automation, and incident response platform.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'Security'],
  },
  singul: {
    displayName: 'Singul AI Agent',
    description: 'Autonomous AI execution engine for running security actions and automations.',
    image: singulAgentIconImg,
    categories: ['Built-in', 'Agent'],
  },
  core: {
    displayName: 'Shuffle Core',
    description: 'Core execution environment and workflow orchestration runtime.',
    image: shuffleLogoImg,
    categories: ['Built-in', 'System'],
  },
};

export const getBuiltInAppMetadata = (name?: string | null): BuiltInAppMetadata | null => {
  if (!name) return null;
  const target = normalizeAppName(String(name));
  if (!target) return null;
  const match = BUILT_IN_APP_METADATA[target];
  if (match) {
    return { name: target, ...match };
  }
  if (isNoAuthApp(target)) {
    // Generic fallback for any other no-auth / internal Shuffle app
    const formatted = target
      .replace(/^shuffles?_/, 'Shuffle ')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
    return {
      name: target,
      displayName: formatted,
      description: 'Built-in Shuffle automation app.',
      image: target.includes('singul') ? singulAgentIconImg : shuffleLogoImg,
      categories: ['Built-in'],
    };
  }
  return null;
};

export const getBuiltInAppImage = (name?: string | null): string | null => {
  if (!name) return null;
  const meta = getBuiltInAppMetadata(name);
  return meta?.image || null;
};

