import { describe, expect, it } from 'vitest';
import {
  ASK_FIRST_PREFIX,
  asksForApproval,
  buildChatThread,
  describeStep,
  getAnswersFromModelReplies,
  getAppsNeedingAuth,
  getChangedNodeIds,
  getFailureReason,
  getLatestChanges,
  getNodeLabels,
  getQuickReplies,
  getRunIdleSeconds,
  getRunNodes,
  getWorkflowRuns,
  getWorkflowProblems,
  stripModePrefix,
  toSeconds,
  type ChatDecision,
  type ChatThreadItem,
} from './agentChat';

// Shapes taken from real workflow-edit runs (Google Sheets replacing an HTTP node)
const lookup: ChatDecision = {
  action: 'post_get_app_actions_summary',
  fields: [{ key: 'body', value: '{"app_names":["Google_Sheets"]}' }],
  run_details: {
    id: 'lookup',
    status: 'FINISHED',
    raw_response: JSON.stringify({
      success: true,
      status: 200,
      url: '/api/v1/apps/actions',
      body: [{ app_name: 'Google_Sheets', app_id: 'fe62', actions: [{ name: 'post_append_values_to_spreadsheet' }], setup_url: '/apps/fe62' }],
    }),
  },
};

const readWorkflow: ChatDecision = {
  action: 'get_minimal_workflow',
  run_details: {
    id: 'read',
    status: 'FINISHED',
    started_at: 1792131539803,
    completed_at: 1792131540373,
    raw_response: JSON.stringify({ success: true, body: { actions: [{ id: 'c45c', label: 'append_sheet_values_1' }, { id: '0fdf', label: 'wassup' }] } }),
  },
};

const swap: ChatDecision = {
  action: 'put_agent_update',
  fields: [{ key: 'body', value: JSON.stringify({ workflow_id: 'wf', operations: [
    { op: 'edit_node', id: 'c45c', data: { app_id: 'fe62', app_name: 'Google_Sheets', action_name: 'post_append_values_to_spreadsheet' } },
    { op: 'add_node', temp_id: 'notify', data: { app_id: 'slack', label: 'notify' } },
    { op: 'add_branch', data: { source_id: 'c45c', destination_id: 'notify' } },
    { op: 'save_workflow' },
  ] }) }],
  run_details: {
    id: 'swap',
    status: 'FINISHED',
    raw_response: JSON.stringify({ success: true, status: 200, body: { success: true, operations_applied: 4, id_mapping: { notify: '7777' }, workflow: { actions: [{ id: 'c45c', label: 'append_sheet_values_1', errors: ['range is empty'] }] } } }),
  },
};

const summarize = (items: ChatThreadItem[]) =>
  items.map((item) => (item.type === 'steps' ? `steps:${item.steps.length}` : `${item.type}:${item.text}`));

describe('agent chat steps', () => {
  it('describes steps in plain language using node labels', () => {
    const labels = getNodeLabels([readWorkflow, swap]);
    expect(describeStep(readWorkflow, labels).label).toBe('Read the workflow');
    expect(describeStep(lookup, labels)).toEqual({ label: 'Looked up Google Sheets', details: ['Google Sheets: 1 actions, needs credentials'] });
    expect(describeStep(swap, labels)).toEqual({
      label: 'Changed append_sheet_values_1 to Google Sheets (post append values to spreadsheet) and 2 more',
      details: [
        'Changed append_sheet_values_1 to Google Sheets (post append values to spreadsheet)',
        'Added notify',
        'Connected append_sheet_values_1 to notify',
      ],
    });
  });

  it('lists the nodes and changes of an edit, and the problems it reported', () => {
    const labels = getNodeLabels([readWorkflow, swap]);
    expect(getChangedNodeIds(swap)).toEqual(['c45c', '7777']);
    expect(getLatestChanges([readWorkflow, swap], labels).map((change) => change.nodeId)).toEqual(['c45c', '7777', undefined]);
    expect(getWorkflowProblems([swap])).toEqual([{ text: 'append_sheet_values_1: range is empty', nodeId: 'c45c' }]);
  });

  it('finds why a step failed, including plain-text timeouts', () => {
    const failed: ChatDecision = { run_details: { raw_response: JSON.stringify({ success: false, body: { success: false, reason: 'Operation 1 failed: id is required' } }) } };
    expect(getFailureReason(failed)).toBe('Operation 1 failed: id is required');
    expect(getFailureReason({ run_details: { status: 'FAILURE', raw_response: '\n[ERROR] Decision marked as FAILURE due to 5 minute timeout.' } }))
      .toBe('Decision marked as FAILURE due to 5 minute timeout.');
    expect(getFailureReason(lookup)).toBe('');
  });

  it('tracks apps that still need credentials until a later lookup says otherwise', () => {
    expect(getAppsNeedingAuth([lookup])).toEqual([{ id: 'fe62', name: 'Google Sheets', url: '/apps/fe62' }]);
    const later: ChatDecision = { ...lookup, run_details: { ...lookup.run_details, raw_response: JSON.stringify({ body: [{ app_name: 'Google_Sheets', app_id: 'fe62', actions: [], authenticated: true }] }) } };
    expect(getAppsNeedingAuth([lookup, later])).toEqual([]);
  });

  it('handles second and millisecond timestamps', () => {
    expect(toSeconds(1792131517)).toBe(1792131517);
    expect(toSeconds(1792131540373) - toSeconds(1792131539803)).toBeCloseTo(0.57);
  });
});

// Mirrors run d62798d3: a question, an answer, a follow-up, a second answer.
// The follow-up rewrote the first finish decision, so the first answer is only in the model replies.
const reply = (decisions: object[]) => ({ choices: [{ message: { role: 'assistant', content: '```json\n' + JSON.stringify(decisions) + '\n```' } }] });
const modelReplies = [
  reply([{ action: 'get_minimal_workflow', category: 'singul' }]),
  reply([{ i: 0, action: 'finish', category: 'finish', fields: [{ key: 'output', value: 'First answer' }] }]),
  reply([{ i: 0, action: 'finish', category: 'finish', fields: [{ key: 'output', value: 'Second answer' }] }]),
];
const followUp: ChatDecision[] = [
  readWorkflow,
  { i: 1, action: 'ask', category: 'standalone', fields: [{ key: 'continue', value: 'How do you want to continue?', answer: ASK_FIRST_PREFIX + 'so tell me what is this workflow about?' }], run_details: { id: 'b', status: 'FINISHED' } },
  { i: 2, action: 'finish', category: 'finish', fields: [{ key: 'output', value: 'Second answer' }], run_details: { id: 'c', status: 'FINISHED' } },
];

describe('agent chat thread', () => {
  it('recovers every answer from the model replies, in order', () => {
    expect(getAnswersFromModelReplies(modelReplies)).toEqual(['First answer', 'Second answer']);
    expect(getAnswersFromModelReplies(undefined)).toEqual([]);
    expect(getAnswersFromModelReplies([{ choices: [{ message: { content: 'not json' } }] }])).toEqual([]);
  });

  it('builds turns, keeping the answer a follow-up overwrote and hiding the mode instruction', () => {
    const thread = buildChatThread({ prompt: ASK_FIRST_PREFIX + 'what is happening?', decisions: followUp, finalAnswer: 'Second answer', finished: true, modelAnswers: getAnswersFromModelReplies(modelReplies) });
    expect(summarize(thread)).toEqual([
      'user:what is happening?',
      'steps:1',
      'agent:First answer',
      'user:so tell me what is this workflow about?',
      'agent:Second answer',
    ]);
  });

  it('prefers answers seen in this session, and shows no answer while still working', () => {
    const thread = buildChatThread({ prompt: 'q', decisions: followUp.slice(0, 2), finished: false, knownAnswers: { b: 'Seen answer' }, modelAnswers: ['Other'] });
    expect(summarize(thread)).toEqual(['user:q', 'steps:1', 'agent:Seen answer', 'user:so tell me what is this workflow about?']);
  });

  it('matches answers from the newest turn back when older replies are missing', () => {
    const thread = buildChatThread({ prompt: 'q', decisions: followUp, finalAnswer: '', finished: true, modelAnswers: ['Second answer'] });
    expect(summarize(thread)).toEqual(['user:q', 'steps:1', 'user:so tell me what is this workflow about?', 'agent:Second answer']);
  });

  it('shows agent questions and the user answers in place', () => {
    const asked: ChatDecision = { action: 'ask', category: 'standalone', fields: [{ key: 'question', value: 'Which sheet?', answer: 'Sheet1' }], run_details: { id: 'q', status: 'FINISHED' } };
    expect(summarize(buildChatThread({ prompt: 'q', decisions: [lookup, asked], finished: false }))).toEqual(['user:q', 'steps:1', 'agent:Which sheet?', 'user:Sheet1']);
  });
});

describe('agent chat replies', () => {
  it('offers numbered options, Yes/No, or approval replies', () => {
    expect(getQuickReplies('I found two sheets. Should I use the first one?')).toEqual(['Yes', 'No']);
    expect(getQuickReplies('Which trigger do you want?\n1. Webhook\n2. Schedule\n3. **User Input**')).toEqual(['Webhook', 'Schedule', 'User Input']);
    expect(getQuickReplies('Here is the plan. Please confirm if you would like me to proceed.')).toEqual(['Yes, go ahead', 'No']);
    expect(getQuickReplies('Google Sheets needs to be authenticated. Reply **done**.')).toEqual([]);
  });

  it('only treats a question as needing approval when it asks for one', () => {
    // Run ea30adec: a plan plus a credentials link. Adding credentials must not count as the yes.
    expect(asksForApproval('Here is the plan...\n3. [Authenticate Google Sheets](/apps/fe62).\n\nPlease confirm if you would like me to proceed with these changes.')).toBe(true);
    // Run 3b7b273b: credentials only
    expect(asksForApproval('Google Sheets needs to be authenticated before this workflow can run. [Authenticate Google Sheets](/apps/fe62), then reply **done**.')).toBe(false);
  });

  it('hides the ask-first instruction from what the user sees', () => {
    expect(stripModePrefix(ASK_FIRST_PREFIX + 'add a slack step')).toBe('add a slack step');
  });
});

// Mirrors run 7baac1be starting execution 904f2347, where Google Sheets never ran
describe('agent workflow runs', () => {
  const started: ChatDecision = {
    action: 'post_run_workflow',
    fields: [{ key: 'workflowId', value: 'wf' }, { key: 'body', value: '{"execution_argument":"{}"}' }],
    run_details: { id: 'run', status: 'FINISHED', raw_response: JSON.stringify({ status: 200, body: { success: true, execution_id: 'exec', authorization: 'auth' }, url: '/api/v1/workflows/wf/run' }) },
  };
  const failedStart: ChatDecision = { action: 'post_run_workflow', run_details: { id: 'bad', status: 'IGNORED', raw_response: 'Failed to start decision action. Raw Error: DirectAppCall: executeSingleAction returned HTTP 401' } };
  const execution = {
    status: 'EXECUTING',
    start: 'py',
    started_at: 1792172835,
    workflow: {
      actions: [{ id: 'py', label: 'wassup' }, { id: 'sheet', label: 'append_sheet_values_1' }, { id: 'mail', label: 'notify' }],
      branches: [{ source_id: 'py', destination_id: 'sheet' }, { source_id: 'sheet', destination_id: 'mail' }],
    },
    results: [{ action: { id: 'py' }, status: 'SUCCESS', completed_at: 1792172844352 }],
  };

  it('finds runs the agent started, skipping ones that never started', () => {
    expect(getWorkflowRuns([failedStart, started])).toEqual([{ decisionId: 'run', workflowId: 'wf', executionId: 'exec', authorization: 'auth' }]);
  });

  it('shows each node as the engine recorded it', () => {
    expect(getRunNodes(execution).map((node) => `${node.label}:${node.status}`)).toEqual(['wassup:done', 'append sheet values 1:waiting', 'notify:not run']);
    const failed = { ...execution, status: 'ABORTED', results: [...execution.results, { action: { id: 'sheet' }, status: 'FAILURE', result: '{"success":false,"reason":"403 from google-sheets"}' }] };
    expect(getRunNodes(failed).map((node) => `${node.status}:${node.reason || ''}`)).toEqual(['done:', 'failed:403 from google-sheets', 'not run:']);
  });

  it('measures how long the run has made no progress', () => {
    expect(getRunIdleSeconds(execution, 1792172844352 + 180000)).toBeCloseTo(180);
  });
});
