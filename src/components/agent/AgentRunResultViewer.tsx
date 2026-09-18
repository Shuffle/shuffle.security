/**
 * Expandable result viewer for an agent execution run.
 * Renders output as Markdown + JSON from results[0].result using react18-json-view.
 */

import { Box, Typography, Collapse, useTheme } from '@mui/material';
import { useState } from 'react';
import { AlertTriangle, HelpCircle, ExternalLink, ChevronRight, ChevronDown } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import JsonView from 'react18-json-view';
import 'react18-json-view/src/style.css';
import 'react18-json-view/src/dark.css';
import { defaultCollapsed } from '@/lib/jsonView';
import { AgentRun } from '@/services/agentActivity';
import { parseDatastoreReference, DatastoreReference } from '@/lib/agentParsers';
export type { DatastoreReference };

// Diagnosis logic now lives in the Shuffle-MCPs lib so every surface that
// shows an agent run uses identical reasoning. Re-exported for back-compat.
import {
  parseRunResult,
  getFailureInfo,
  hasOutputWarning,
  diagnoseOutputWarning,
} from '@/Shuffle-MCPs';
export {
  parseRunResult,
  getFailureInfo,
  hasOutputWarning,
  diagnoseOutputWarning,
};
export type { DiagnosisEvidence, OutputDiagnosis } from '@/Shuffle-MCPs';

/** Check if a run's result matches a search query */
export const runMatchesSearch = (run: AgentRun, query: string): boolean => {
  const q = query.toLowerCase();

  if (
    run.execution_id?.toLowerCase().includes(q) ||
    run.status?.toLowerCase().includes(q) ||
    run.execution_argument?.toLowerCase().includes(q) ||
    run.execution_source?.toLowerCase().includes(q) ||
    run.workflow?.name?.toLowerCase().includes(q)
  ) return true;

  if (run.results) {
    for (const r of run.results) {
      if (r.result?.toLowerCase().includes(q)) return true;
      if (r.action?.app_name?.toLowerCase().includes(q)) return true;
      if (r.action?.label?.toLowerCase().includes(q)) return true;
    }
  }

  return false;
};

/** Extract the output/description text from a run result */
const getOutputText = (parsed: any): string | null => {
  if (!parsed || typeof parsed !== 'object') return null;
  if (typeof parsed.output === 'string' && parsed.output.trim()) return parsed.output;
  if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message;
  return null;
};

// parseDatastoreReference and DatastoreReference are now imported from @/lib/agentParsers
export { parseDatastoreReference };

/** Get a link path if the reference is to a known entity */
const getReferencePath = (ref: DatastoreReference): string | null => {
  if (ref.category === 'shuffle-security_incidents') {
    return `/incidents/${ref.key}`;
  }
  return null;
};

interface AgentRunResultViewerProps {
  run: AgentRun;
}

const AgentRunResultViewer = ({ run }: AgentRunResultViewerProps) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { raw, parsed } = parseRunResult(run);
  const isFailed = run.status?.toUpperCase() === 'FAILED' || run.status?.toUpperCase() === 'ABORTED';
  const failureInfo = getFailureInfo(run);
  const outputWarning = !isFailed && hasOutputWarning(run);
  const diagnosis = outputWarning ? diagnoseOutputWarning(run) : null;
  const outputText = getOutputText(parsed);
  const datastoreRef = parseDatastoreReference(run);
  const refPath = datastoreRef ? getReferencePath(datastoreRef) : null;
  const [debugOpen, setDebugOpen] = useState(false);

  if (!raw) {
    return (
      <Box sx={{ px: 2.5, py: 1.5 }}>
        <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' }}>
          No result data available
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ px: 2.5, pb: 2, pt: 1 }}>
      {/* Failure reason banner */}
      {isFailed && failureInfo && (
        <Box sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          px: 1.5,
          py: 1,
          mb: 1.5,
          borderRadius: 1,
          bgcolor: 'hsla(var(--severity-critical) / 0.08)',
          border: '1px solid hsla(var(--severity-critical) / 0.2)',
        }}>
          <AlertTriangle size={14} style={{ color: 'hsl(var(--severity-critical))', marginTop: 2, flexShrink: 0 }} />
          <Typography sx={{
            fontSize: '0.78rem',
            color: 'hsl(var(--severity-critical))',
            lineHeight: 1.5,
            wordBreak: 'break-word',
          }}>
            {failureInfo.reason}
          </Typography>
        </Box>
      )}

      {/* Output warning banner — uses the diagnosis to show the actual
          error type (auth/permission/rate-limit/...) and a remediation hint
          instead of a generic "may need review" message. */}
      {outputWarning && diagnosis && (
        <Box sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          px: 1.5,
          py: 1,
          mb: 1.5,
          borderRadius: 1,
          bgcolor: 'hsla(var(--severity-medium) / 0.08)',
          border: '1px solid hsla(var(--severity-medium) / 0.2)',
        }}>
          <HelpCircle size={14} style={{ color: 'hsl(var(--severity-medium))', marginTop: 2, flexShrink: 0 }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'hsl(var(--severity-medium))',
              lineHeight: 1.4,
              mb: 0.25,
            }}>
              {diagnosis.title}
            </Typography>
            <Typography sx={{
              fontSize: '0.74rem',
              color: 'hsl(var(--foreground))',
              lineHeight: 1.5,
              mb: 0.5,
            }}>
              {diagnosis.explanation}
            </Typography>
            <Typography sx={{
              fontSize: '0.74rem',
              color: 'hsl(var(--foreground))',
              lineHeight: 1.5,
            }}>
              <Box component="span" sx={{ fontWeight: 600, color: 'hsl(var(--severity-medium))' }}>
                How to fix:
              </Box>{' '}
              {diagnosis.remediation}
            </Typography>
            {diagnosis.evidence && diagnosis.evidence.length > 0 && (
              <Box sx={{ mt: 0.75 }}>
                <Typography sx={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'hsl(var(--muted-foreground))',
                  mb: 0.5,
                }}>
                  Where this was found
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {(() => {
                    // Dedupe identical errors by value — only show the first
                    // occurrence, with a count of how many times it repeated.
                    const seen = new Map<string, { ev: typeof diagnosis.evidence[number]; count: number; firstIdx: number }>();
                    diagnosis.evidence.forEach((ev, idx) => {
                      const key = String(ev.value ?? '');
                      const entry = seen.get(key);
                      if (entry) entry.count += 1;
                      else seen.set(key, { ev, count: 1, firstIdx: idx });
                    });
                    return Array.from(seen.values()).slice(0, 1).map(({ ev, count, firstIdx: idx }) => (
                    <Box
                      key={`${ev.path}-${idx}`}
                      sx={{
                        p: 0.75,
                        borderRadius: 0.5,
                        bgcolor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                      }}
                    >
                      <Typography sx={{
                        fontSize: '0.65rem',
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                        color: 'hsl(var(--severity-medium))',
                        fontWeight: 600,
                        mb: 0.25,
                        wordBreak: 'break-all',
                      }}>
                        results[0].result.{ev.path || '(root)'}
                      </Typography>
                      <Typography sx={{
                        fontSize: '0.7rem',
                        fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                        color: 'hsl(var(--foreground))',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: 80,
                        overflow: 'auto',
                      }}>
                        {ev.value}
                      </Typography>
                      {count > 1 && (
                        <Typography sx={{
                          fontSize: '0.65rem',
                          color: 'hsl(var(--muted-foreground))',
                          mt: 0.5,
                          fontStyle: 'italic',
                        }}>
                          Repeated {count} times
                        </Typography>
                      )}
                    </Box>
                    ));
                  })()}
                </Box>
                <Typography sx={{
                  fontSize: '0.65rem',
                  color: 'hsl(var(--muted-foreground))',
                  mt: 0.5,
                  fontStyle: 'italic',
                }}>
                  Open the Debug section below to see the full response.
                </Typography>
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* Datastore reference link */}
      {datastoreRef && (
        <Box sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 1,
          mb: 1.5,
          borderRadius: 1,
          bgcolor: 'hsla(var(--primary) / 0.06)',
          border: '1px solid hsla(var(--primary) / 0.15)',
        }}>
          {refPath ? (
            <Link
              to={refPath}
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ExternalLink size={13} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
              <Typography sx={{
                fontSize: '0.78rem',
                color: 'hsl(var(--primary))',
                fontWeight: 500,
                '&:hover': { textDecoration: 'underline' },
              }}>
                Incident {datastoreRef.key.slice(0, 12)}…
              </Typography>
            </Link>
          ) : (
            <>
              <Typography sx={{ fontSize: '0.78rem', color: 'hsl(var(--muted-foreground))' }}>
                {datastoreRef.category}
              </Typography>
              <Typography sx={{ fontSize: '0.72rem', color: 'hsl(var(--muted-foreground))', opacity: 0.7, fontFamily: 'monospace' }}>
                {datastoreRef.key.slice(0, 16)}…
              </Typography>
            </>
          )}
        </Box>
      )}

      {/* Output as rendered Markdown */}
      {outputText && (
        <Box sx={{
          mb: 1.5,
          px: 0.5,
          '& p': {
            fontSize: '0.82rem',
            color: 'hsl(var(--foreground))',
            lineHeight: 1.65,
            m: 0,
            mb: 0.5,
          },
          '& p:last-child': { mb: 0 },
          '& a': {
            color: 'hsl(var(--primary))',
            textDecoration: 'none',
            '&:hover': { textDecoration: 'underline' },
          },
          '& code': {
            fontSize: '0.75rem',
            bgcolor: 'hsl(var(--muted))',
            px: 0.75,
            py: 0.25,
            borderRadius: 0.5,
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          },
          '& pre': {
            bgcolor: 'hsl(var(--muted))',
            border: '1px solid hsl(var(--border))',
            borderRadius: 1,
            p: 1.5,
            overflow: 'auto',
            '& code': { bgcolor: 'transparent', p: 0 },
          },
          '& ul, & ol': {
            fontSize: '0.82rem',
            color: 'hsl(var(--foreground))',
            pl: 2.5,
            m: 0,
            mb: 0.5,
          },
          '& li': { mb: 0.25 },
          '& blockquote': {
            borderLeft: '3px solid hsl(var(--border))',
            pl: 1.5,
            ml: 0,
            color: 'hsl(var(--muted-foreground))',
            fontStyle: 'italic',
          },
          '& h1, & h2, & h3, & h4': {
            fontSize: '0.85rem',
            fontWeight: 600,
            color: 'hsl(var(--foreground))',
            mt: 1,
            mb: 0.5,
          },
        }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {outputText}
          </ReactMarkdown>
        </Box>
      )}

      {/* DEBUG section — collapsed by default; contains raw JSON viewer */}
      <Box sx={{ mt: 1 }}>
        <Box
          onClick={() => setDebugOpen((v) => !v)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            cursor: 'pointer',
            userSelect: 'none',
            px: 0.5,
            py: 0.5,
            borderRadius: 0.75,
            color: 'hsl(var(--muted-foreground))',
            '&:hover': { color: 'hsl(var(--foreground))' },
          }}
        >
          {debugOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Typography sx={{
            fontSize: '0.65rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}>
            Debug
          </Typography>
        </Box>
        <Collapse in={debugOpen} unmountOnExit>
          <Box sx={{
            mt: 0.75,
            p: 1.5,
            borderRadius: 1,
            bgcolor: 'hsl(var(--muted))',
            border: '1px solid hsl(var(--border))',
            overflow: 'auto',
            '&::-webkit-scrollbar': { width: 6 },
            '&::-webkit-scrollbar-thumb': {
              bgcolor: 'hsl(var(--muted-foreground) / 0.3)',
              borderRadius: 3,
            },
            '& .json-view': {
              fontSize: '0.75rem !important',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace !important',
              bgcolor: 'transparent !important',
            },
          }}>
            {parsed ? (
              <JsonView
                src={parsed}
                dark={isDark}
                collapsed={defaultCollapsed}
                collapseStringMode="word"
                collapseStringsAfterLength={120}
                enableClipboard
                displaySize
              />
            ) : (
              <pre style={{
                margin: 0,
                fontSize: '0.72rem',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
                color: 'hsl(var(--foreground))',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                lineHeight: 1.6,
              }}>
                {raw}
              </pre>
            )}
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
};

export default AgentRunResultViewer;
