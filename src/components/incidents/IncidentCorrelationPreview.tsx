import { ExternalLink as OpenInNewIcon, ExternalLink as LaunchIcon, Trash as DeleteOutlineIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Box, Typography, Chip, CircularProgress, Button, Divider, Alert } from '@mui/material';
import { Link } from '@/lib/router-compat';
import { getIncidentUrl, toCanonicalIncidentId } from '@/lib/incidentUrl';
import { lookupIncidentCached } from './incidentPreviewCache';

interface IncidentCorrelationPreviewProps {
  /** Incident ID for the chip the user clicked. */
  incidentKey: string;
  /** Datastore category — kept generic in case we widen pivot support later. */
  category: string;
  /** Correlation key (the shared attribute) we're pivoting on, e.g. "frikky@shuffler.io". */
  correlationKey: string;
  /** Current incident ID — passed back as `focus` so the row pulses on the target page. */
  currentIncidentId?: string;
}

interface IncidentPreview {
  title?: string;
  status?: string;
  severity?: string;
  description?: string;
  createdTs?: number;
  observableCount?: number;
  taskCount?: number;
  raw?: unknown;
}

/**
 * Inline preview shown inside the correlation pivot popover. Loads the target
 * incident from the datastore and renders just enough context (title,
 * status, severity, summary, observable/task counts) so the user can decide
 * whether to actually pivot — without committing to a full page navigation.
 */
export const IncidentCorrelationPreview = ({
  incidentKey,
  category,
  correlationKey,
  currentIncidentId,
}: IncidentCorrelationPreviewProps) => {
  const [preview, setPreview] = useState<IncidentPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Distinguish "deleted / never existed" from a transport error so the user
  // sees a meaningful empty state and the Pivot button is disabled.
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    setNotFound(false);
    (async () => {
      const result = await lookupIncidentCached(incidentKey, category);
      if (cancelled) return;
      if (result.status === 'error') {
        setError(result.error);
        setLoading(false);
        return;
      }
      if (result.status === 'not_found') {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const raw = result.raw;
      let parsed: Record<string, unknown> | undefined;
      if (typeof raw === 'string') {
        try { parsed = JSON.parse(raw); } catch { /* ignore */ }
      } else if (raw && typeof raw === 'object') {
        parsed = raw as Record<string, unknown>;
      }
      if (!parsed || (typeof parsed === 'object' && Object.keys(parsed).length === 0)) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      const findings = (parsed?.finding_info as Record<string, unknown> | undefined)
        || (parsed as Record<string, unknown> | undefined);
      const customAttrs = ((parsed?.metadata as Record<string, unknown> | undefined)?.extensions as Record<string, unknown> | undefined)?.custom_attributes as Record<string, unknown> | undefined;
      const title = (findings?.title as string | undefined)
        || (parsed?.title as string | undefined)
        || (customAttrs?.title as string | undefined)
        || incidentKey;
      const status = (parsed?.status as string | undefined)
        || ((parsed?.status_id as { id?: number; name?: string } | string)
          ? typeof parsed?.status_id === 'string' ? parsed.status_id as string : (parsed?.status_id as { name?: string })?.name
          : undefined)
        || (customAttrs?.status as string | undefined);
      const severity = (parsed?.severity as string | undefined)
        || ((parsed?.severity_id as { name?: string } | undefined)?.name as string | undefined)
        || (customAttrs?.severity as string | undefined);
      const description = (findings?.desc as string | undefined)
        || (parsed?.description as string | undefined)
        || (customAttrs?.description as string | undefined);
      const createdTs = (parsed?.created as number | undefined)
        || (result.item?.created as number | undefined);
      const observables = (customAttrs?.observables as unknown[] | undefined)
        || (parsed?.observables as unknown[] | undefined);
      const tasks = (customAttrs?.tasks as unknown[] | undefined)
        || (parsed?.tasks as unknown[] | undefined);
      setPreview({
        title,
        status: typeof status === 'string' ? status : undefined,
        severity: typeof severity === 'string' ? severity : undefined,
        description: typeof description === 'string' ? description : undefined,
        createdTs: typeof createdTs === 'number' ? createdTs : undefined,
        observableCount: Array.isArray(observables) ? observables.length : undefined,
        taskCount: Array.isArray(tasks) ? tasks.length : undefined,
        raw: parsed,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [incidentKey, category]);


  const targetUrl = `${getIncidentUrl(incidentKey)}?tab=correlations&correlation=${encodeURIComponent(correlationKey)}${currentIncidentId ? `&focus=${encodeURIComponent(toCanonicalIncidentId(currentIncidentId))}` : ''}`;

  // Severity → color (matches the rest of the app's incident severity tokens).
  const sev = (preview?.severity || '').toLowerCase();
  const severityColor =
    sev === 'critical' ? 'hsl(var(--destructive))'
    : sev === 'high' ? '#ff6600'
    : sev === 'medium' ? '#eab308'
    : sev === 'low' ? 'hsl(var(--muted-foreground))'
    : 'hsl(var(--muted-foreground))';

  return (
    <Box sx={{ width: 360, p: 1.75, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'hsl(var(--muted-foreground))', fontSize: '0.6rem' }}>
          Correlated incident
        </Typography>
        <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'hsl(var(--muted-foreground))', fontSize: '0.6rem' }}>
          {incidentKey}
        </Typography>
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
          <CircularProgress size={14} />
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.7rem' }}>
            Loading incident…
          </Typography>
        </Box>
      )}

      {!loading && error && (
        <Typography variant="caption" sx={{ color: 'hsl(var(--destructive))', fontSize: '0.7rem', fontStyle: 'italic' }}>
          Could not load preview: {error}
        </Typography>
      )}

      {!loading && !error && notFound && (
        <Alert
          severity="warning"
          icon={<DeleteOutlineIcon size={18} />}
          sx={{
            py: 0.75,
            px: 1.25,
            fontSize: '0.72rem',
            bgcolor: 'hsl(var(--muted) / 0.5)',
            color: 'hsl(var(--foreground))',
            border: '1px solid hsl(var(--border))',
            '& .MuiAlert-message': { p: 0, lineHeight: 1.4 },
            '& .MuiAlert-icon': { color: 'hsl(var(--muted-foreground))', mr: 1, p: 0, alignItems: 'center' },
          }}
        >
          <Box sx={{ fontWeight: 700, mb: 0.25 }}>Incident no longer exists</Box>
          <Box sx={{ color: 'hsl(var(--muted-foreground))', mb: 0.75 }}>
            The correlation still references <Box component="span" sx={{ fontFamily: 'monospace', color: 'hsl(var(--foreground))' }}>{incidentKey}</Box>, but the incident has been deleted. Pivoting will land on an empty page.
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
            <Button
              component="a"
              href={targetUrl}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              variant="outlined"
              onClick={(e) => e.stopPropagation()}
              startIcon={<LaunchIcon size={12} />}
              sx={{ height: 26, fontSize: '0.65rem', textTransform: 'none', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
            >
              Open anyway
            </Button>
          </Box>
        </Alert>
      )}

      {!loading && !error && !notFound && preview && (
        <>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: 'hsl(var(--foreground))', lineHeight: 1.3 }}>
            {preview.title}
          </Typography>

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {preview.severity && (
              <Chip
                label={preview.severity}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  bgcolor: 'transparent',
                  border: `1px solid ${severityColor}`,
                  color: severityColor,
                }}
              />
            )}
            {preview.status && (
              <Chip
                label={preview.status}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  bgcolor: 'hsl(var(--muted) / 0.5)',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--muted-foreground))',
                }}
              />
            )}
            {typeof preview.observableCount === 'number' && (
              <Chip
                label={`${preview.observableCount} observable${preview.observableCount === 1 ? '' : 's'}`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6rem',
                  bgcolor: 'transparent',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--muted-foreground))',
                }}
              />
            )}
            {typeof preview.taskCount === 'number' && preview.taskCount > 0 && (
              <Chip
                label={`${preview.taskCount} task${preview.taskCount === 1 ? '' : 's'}`}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.6rem',
                  bgcolor: 'transparent',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--muted-foreground))',
                }}
              />
            )}
          </Box>

          {preview.description && (
            <Typography
              sx={{
                fontSize: '0.72rem',
                color: 'hsl(var(--muted-foreground))',
                lineHeight: 1.45,
                display: '-webkit-box',
                WebkitLineClamp: 4,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {preview.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()}
            </Typography>
          )}

          <Divider sx={{ borderColor: 'hsl(var(--border))', my: 0.25 }} />

          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.65rem' }}>
              Pivoting on <Box component="span" sx={{ fontFamily: 'monospace', color: 'hsl(var(--foreground))' }}>{correlationKey}</Box>
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Button
                component="a"
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                variant="outlined"
                onClick={(e) => e.stopPropagation()}
                startIcon={<LaunchIcon size={12} />}
                sx={{ height: 28, fontSize: '0.7rem', textTransform: 'none', borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
              >
                New tab
              </Button>
              <Button
                component={Link}
                to={targetUrl}
                size="small"
                variant="contained"
                onClick={(e) => e.stopPropagation()}
                endIcon={<OpenInNewIcon size={12} />}
                sx={{ height: 28, fontSize: '0.7rem', textTransform: 'none' }}
              >
                Pivot
              </Button>
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
};

export default IncidentCorrelationPreview;
