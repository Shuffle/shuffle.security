import React from 'react';
import { Box, Typography, IconButton, Tooltip, Button, TextField } from '@mui/material';
import { X as CloseIcon, Plus as AddIcon } from 'lucide-react';

export interface AiAgentPromptsEditorProps {
  /** Ordered list of prompts. */
  prompts: string[];
  /** Per-prompt allow-list of app IDs/names (parallel array to `prompts`). */
  apps: string[][];
  /** Read-only mode: render prompts as plain text, no edit/add/remove. */
  readOnly?: boolean;
  /** Optional skill label (e.g. "Incident Handler") to show shared permission context. */
  skillLabel?: string;
  /** Optional check if an app key is a built-in default app for the active skill. */
  isBuiltInApp?: (appKey: string) => boolean;
  /** Edit handlers — required when `readOnly` is false. */
  onChangePrompt?: (index: number, value: string) => void;
  onRemovePrompt?: (index: number) => void;
  onAddPrompt?: () => void;
  onRemoveApp?: (promptIndex: number, appKey: string) => void;
  onAddAppRequested?: (promptIndex: number) => void;
  /** Resolves an app key to its display metadata. */
  resolveAppMeta: (key: string) => { name: string; image: string };
  /** Optional slot to render a richer prompt editor (e.g. PopupTextEditor).
   *  If omitted, a multiline MUI TextField is rendered in edit mode. */
  renderPromptInput?: (props: {
    index: number;
    value: string;
    onChange: (next: string) => void;
    placeholder: string;
  }) => React.ReactNode;
}

const AiAgentPromptsEditor: React.FC<AiAgentPromptsEditorProps> = ({
  prompts,
  apps,
  readOnly = false,
  skillLabel,
  isBuiltInApp,
  onChangePrompt,
  onRemovePrompt,
  onAddPrompt,
  onRemoveApp,
  onAddAppRequested,
  resolveAppMeta,
  renderPromptInput,
}) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      {prompts.map((prompt, idx) => {
        const promptApps = apps[idx] || [];
        return (
          <Box
            key={idx}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
              p: 1,
              border: '1px solid hsl(var(--border))',
              borderRadius: 1.5,
              bgcolor: 'hsl(var(--muted) / 0.2)',
            }}
          >
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    color: 'hsl(var(--muted-foreground))',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    mb: 0.5,
                  }}
                >
                  Prompt {idx + 1}
                </Typography>
                {readOnly ? (
                  <Typography
                    sx={{
                      fontSize: '0.82rem',
                      color: 'hsl(var(--foreground))',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.55,
                    }}
                  >
                    {prompt || <em style={{ opacity: 0.6 }}>Empty prompt</em>}
                  </Typography>
                ) : renderPromptInput ? (
                  renderPromptInput({
                    index: idx,
                    value: prompt,
                    onChange: (next) => onChangePrompt?.(idx, next),
                    placeholder: `Prompt ${idx + 1}...`,
                  })
                ) : (
                  <TextField
                    fullWidth
                    multiline
                    minRows={3}
                    value={prompt}
                    onChange={(e) => onChangePrompt?.(idx, e.target.value)}
                    placeholder={`Prompt ${idx + 1}...`}
                    size="small"
                  />
                )}
              </Box>
              {!readOnly && prompts.length > 1 && onRemovePrompt && (
                <IconButton
                  size="small"
                  onClick={() => onRemovePrompt(idx)}
                  sx={{
                    color: 'text.secondary',
                    '&:hover': { color: 'hsl(var(--destructive))' },
                  }}
                >
                  <CloseIcon size={16} />
                </IconButton>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Tooltip
                title={
                  skillLabel
                    ? `Allowed apps are shared with ${skillLabel} permissions. Changes made here apply to all automations and agent runs.`
                    : 'Apps this AI Agent prompt is permitted to run.'
                }
              >
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                  <Typography
                    sx={{
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      color: 'hsl(var(--muted-foreground))',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Allowed apps
                  </Typography>
                  {skillLabel && (
                    <Typography
                      component="span"
                      sx={{
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        color: 'hsl(var(--primary))',
                        bgcolor: 'hsl(var(--primary) / 0.1)',
                        px: 0.6,
                        py: 0.1,
                        borderRadius: 0.75,
                        letterSpacing: '0.02em',
                      }}
                    >
                      {skillLabel} permissions
                    </Typography>
                  )}
                </Box>
              </Tooltip>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', flex: 1 }}>
                {promptApps.length === 0 && (
                  <Typography sx={{ fontSize: '0.7rem', color: 'hsl(var(--muted-foreground))', opacity: 0.7 }}>
                    All authenticated apps
                  </Typography>
                )}
                {promptApps.map((appKey) => {
                  const meta = resolveAppMeta(appKey);
                  const displayName = meta.name;
                  const img = meta.image || `https://shuffler.io/images/apps/${displayName}.png`;
                  const isBuiltIn = isBuiltInApp ? isBuiltInApp(appKey) : false;
                  const clickable = !readOnly && !!onRemoveApp;
                  const tip = isBuiltIn
                    ? `${displayName.replace(/_/g, ' ')} (Default built-in app for ${skillLabel || 'skill'})`
                    : clickable
                    ? `Remove ${displayName.replace(/_/g, ' ')} (Assigned permission)`
                    : displayName.replace(/_/g, ' ');
                  return (
                    <Tooltip key={appKey} title={tip}>
                      <IconButton
                        size="small"
                        disabled={!clickable}
                        onClick={() => clickable && onRemoveApp?.(idx, appKey)}
                        sx={{
                          width: 26,
                          height: 26,
                          border: isBuiltIn
                            ? '1px solid hsl(var(--primary) / 0.35)'
                            : '1px solid hsl(var(--severity-low) / 0.3)',
                          bgcolor: isBuiltIn
                            ? 'hsl(var(--primary) / 0.08)'
                            : 'hsl(var(--severity-low) / 0.1)',
                          borderRadius: 1,
                          '&.Mui-disabled': {
                            opacity: 1,
                            bgcolor: isBuiltIn
                              ? 'hsl(var(--primary) / 0.08)'
                              : 'hsl(var(--severity-low) / 0.1)',
                          },
                          '&:hover': clickable
                            ? {
                                bgcolor: 'hsl(var(--destructive) / 0.15)',
                                borderColor: 'hsl(var(--destructive) / 0.4)',
                              }
                            : undefined,
                        }}
                      >
                        <Box
                          component="img"
                          src={img}
                          alt={displayName}
                          sx={{ width: 16, height: 16, borderRadius: '50%', objectFit: 'contain' }}
                        />
                      </IconButton>
                    </Tooltip>
                  );
                })}
                {!readOnly && onAddAppRequested && (
                  <Tooltip title={skillLabel ? `Assign tools to ${skillLabel}` : 'Add allowed app'}>
                    <IconButton
                      size="small"
                      onClick={() => onAddAppRequested(idx)}
                      sx={{
                        width: 24,
                        height: 24,
                        color: 'hsl(var(--muted-foreground))',
                        border: '1px dashed hsl(var(--border))',
                        borderRadius: 1,
                        '&:hover': {
                          bgcolor: 'hsl(var(--muted))',
                          borderStyle: 'solid',
                          color: 'hsl(var(--primary))',
                        },
                      }}
                    >
                      <AddIcon size={14} />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          </Box>
        );
      })}
      {!readOnly && onAddPrompt && (
        <Button
          size="small"
          onClick={onAddPrompt}
          sx={{
            alignSelf: 'flex-start',
            textTransform: 'none',
            fontSize: '0.8rem',
            color: 'hsl(var(--severity-low))',
          }}
        >
          + Add prompt
        </Button>
      )}
    </Box>
  );
};

export default AiAgentPromptsEditor;
