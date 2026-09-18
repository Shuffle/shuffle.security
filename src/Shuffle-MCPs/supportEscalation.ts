/**
 * Helper to build and launch pre-filled contact form URLs for escalating
 * an Ask Shuffle run or question to Shuffle Support.
 */

export interface SupportEscalationContext {
  userdata?: any;
  pathname?: string;
  search?: string;
  entityTitle?: string;
  initialQuestion?: string;
  executionId?: string;
  executionStatus?: string;
  error?: string;
  category?: string;
}

export interface ResolvedContactUserInfo {
  firstName: string;
  lastName: string;
  email: string;
  title: string;
  company: string;
}

/**
 * Extracts and normalizes user profile fields from available user session data.
 */
export function resolveContactUserInfo(userdata?: any): ResolvedContactUserInfo {
  let user = userdata;
  if (!user && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('shuffle_user_info');
      if (raw) user = JSON.parse(raw);
    } catch {
      // ignore
    }
  }

  const name = (user?.name || user?.username || '').trim();
  let firstName = (user?.firstname || user?.firstName || '').trim();
  let lastName = (user?.lastname || user?.lastName || '').trim();

  if (!firstName && name) {
    const parts = name.split(/\s+/);
    firstName = parts[0] || '';
    if (parts.length > 1) {
      lastName = parts.slice(1).join(' ');
    }
  }

  const email = (user?.email || (user?.username?.includes('@') ? user.username : '') || '').trim();
  const title = (
    user?.title ||
    user?.jobtitle ||
    user?.job_title ||
    user?.role ||
    user?.active_org?.role ||
    ''
  ).trim();
  const company = (user?.company || user?.active_org?.name || '').trim();

  return { firstName, lastName, email, title, company };
}

/**
 * Builds the pre-filled URL pointing to https://shuffler.io/contact
 * using the available form fields:
 * "firstName", "lastName", "email", "title", "company", "category", "message"
 */
export function buildSupportEscalationUrl(context: SupportEscalationContext): string {
  const { firstName, lastName, email, title, company } = resolveContactUserInfo(context.userdata);

  const params = new URLSearchParams();

  // Primary contact form fields matching exact target schema:
  // "firstName", "lastName", "email", "title", "company", "category", "message"
  if (firstName) params.set('firstName', firstName);
  if (lastName) params.set('lastName', lastName);
  if (email) params.set('email', email);
  if (title) params.set('title', title);
  if (company) params.set('company', company);
  params.set('category', context.category || 'Support');

  // Build structured message payload
  const lines: string[] = ['[Escalated from Ask Shuffle]', ''];

  if (context.initialQuestion && context.initialQuestion.trim()) {
    lines.push('Initial Question:');
    lines.push(`"${context.initialQuestion.trim()}"`, '');
  }

  lines.push('Context:');
  const path = context.pathname || (typeof window !== 'undefined' ? window.location.pathname : '');
  if (path) {
    lines.push(`- Page: ${path}${context.entityTitle ? ` (${context.entityTitle})` : ''}`);
  }
  if (context.executionId) {
    lines.push(`- Execution ID: ${context.executionId}`);
    if (typeof window !== 'undefined' && window.location?.origin) {
      lines.push(`- Run URL: ${window.location.origin}/agents?execution_id=${context.executionId}`);
    }
  }
  if (context.executionStatus) {
    lines.push(`- Status: ${context.executionStatus}`);
  }

  if (context.error) {
    lines.push('', 'Error / Diagnostics:');
    lines.push(context.error.slice(0, 1000));
  }

  lines.push('', 'Additional Notes:');
  lines.push('');

  params.set('message', lines.join('\n'));

  // Also include reference parameters for analytics/workflow webhook routing
  params.set('ref', 'ask_shuffle_escalation');
  if (context.executionId) {
    params.set('execution_id', context.executionId);
  }

  return `https://shuffler.io/contact?${params.toString()}`;
}

/**
 * Opens https://shuffler.io/contact pre-filled in a new browser tab.
 */
export function openSupportEscalation(context: SupportEscalationContext): void {
  const url = buildSupportEscalationUrl(context);
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
