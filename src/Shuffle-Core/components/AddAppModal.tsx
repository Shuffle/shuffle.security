/**
 * AddAppModal — Two-phase modal for finding and authenticating apps.
 *
 * Phase 1: ShuffleMCP search (same style as /onboarding/sources)
 * Phase 2: AppAuthCard for the selected app (same as /onboarding/authenticate)
 *
 * Self-contained: lives in Shuffle-MCPs so it can be used inside the library
 * (e.g., AppSearchDrawer) without host-app imports.
 */

import { X as CloseIcon, ArrowLeft as ArrowBackIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  IconButton,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { ShuffleMCP } from '../views/ShuffleMCP';
import type { AppSelectedEvent } from '../shuffle-mcp.helpers';
import { AppAuthCard } from './AppAuthConfig';
import { API_CONFIG } from '../api';
import { useAppAuthFlow } from '../useAppAuthFlow';

// Singul styles — matches /onboarding/sources
const singulStyles = {
  container: { width: '100%' },
  inputWrapper: {
    backgroundColor: 'hsl(var(--background))',
    borderRadius: '12px',
    border: '1px solid hsl(var(--border))',
  },
  input: {
    backgroundColor: 'transparent',
    color: 'hsl(var(--foreground))',
    border: 'none',
    borderRadius: '12px',
    padding: '12px 16px',
    fontSize: '14px',
  },
  searchIcon: { color: 'hsl(var(--muted-foreground))' },
  spinner: {
    borderColor: 'hsl(var(--border))',
    borderTopColor: 'hsl(var(--primary))',
  },
  resultsContainer: { marginTop: '12px', gap: '10px' },
  dropdownItem: {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '12px',
    padding: '14px',
    color: 'hsl(var(--foreground))',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  dropdownItemHover: {
    borderColor: 'hsl(var(--primary) / 0.5)',
    backgroundColor: 'hsl(var(--muted) / 0.5)',
  },
  selectedItem: {
    backgroundColor: 'hsl(var(--primary) / 0.1)',
    borderColor: 'hsl(var(--primary))',
  },
  appIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: 'hsl(var(--muted) / 0.5)',
    objectFit: 'contain' as const,
    padding: '4px',
  },
  appName: { fontSize: '13px', fontWeight: 600, color: 'hsl(var(--foreground))' },
  appDescription: {
    fontSize: '11px',
    color: 'hsl(var(--muted-foreground))',
    lineHeight: 1.4,
  },
  appCategory: {
    marginTop: '6px',
    padding: '2px 8px',
    backgroundColor: 'hsl(var(--muted) / 0.5)',
    color: 'hsl(var(--muted-foreground))',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    borderRadius: '4px',
    display: 'inline-block',
    width: 'fit-content',
  },
  checkbox: { border: '2px solid hsl(var(--border))' },
  checkboxChecked: { backgroundColor: 'hsl(var(--primary))', borderColor: 'hsl(var(--primary))' },
  emptyState: {
    padding: '24px',
    color: 'hsl(var(--muted-foreground))',
    textAlign: 'center' as const,
    fontSize: '13px',
    backgroundColor: 'hsl(var(--muted) / 0.35)',
    borderRadius: '12px',
    border: '1px solid hsl(var(--border))',
    gridColumn: '1 / -1',
  },
};

export interface AddAppModalProps {
  open: boolean;
  onClose: () => void;
  /** Initial search query (e.g. category label like "SIEM") */
  initialQuery: string;
  /** Category label for display */
  categoryLabel: string;
}

type Phase = 'search' | 'auth';

export const AddAppModal = ({ open, onClose, initialQuery, categoryLabel }: AddAppModalProps) => {
  const [phase, setPhase] = useState<Phase>('search');
  const {
    selectedApp,
    authState,
    authenticatedApps,
    authLoading,
    selectApp,
    clearSelection,
    handleAuthChange,
    handleTestConnection,
    handleSaveAuth,
    refreshAuth,
  } = useAppAuthFlow();

  // Reset when modal opens/closes
  useEffect(() => {
    if (!open) {
      setPhase('search');
      clearSelection();
    }
  }, [open, clearSelection]);

  const handleAppSelected = (detail: AppSelectedEvent) => {
    selectApp(detail.app);
    setPhase('auth');
  };

  const handleBack = () => {
    setPhase('search');
    clearSelection();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: 'hsl(var(--card))',
          border: '1px solid hsl(var(--border))',
          borderRadius: '16px',
          color: 'hsl(var(--foreground))',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      <DialogTitle
        sx={{
          px: 3,
          py: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          borderBottom: '1px solid hsl(var(--border))',
          flexShrink: 0,
        }}
      >
        {phase === 'auth' && (
          <IconButton
            size="small"
            onClick={handleBack}
            sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--foreground))' } }}
          >
            <ArrowBackIcon size={20} />
          </IconButton>
        )}

        <Box sx={{ flex: 1 }}>
          <Typography sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, fontSize: '1rem', lineHeight: 1.2 }}>
            {phase === 'search'
              ? `Add ${categoryLabel} Integration`
              : selectedApp?.name.replace(/_/g, ' ')}
          </Typography>
          <Typography sx={{ color: 'hsl(var(--muted-foreground))', fontSize: '0.75rem' }}>
            {phase === 'search'
              ? `Search and select a ${categoryLabel.toLowerCase()} tool to configure`
              : 'Configure authentication'}
          </Typography>
        </Box>

        <IconButton
          size="small"
          onClick={onClose}
          sx={{ color: 'hsl(var(--muted-foreground))', '&:hover': { color: 'hsl(var(--foreground))' } }}
        >
          <CloseIcon size={20} />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
        <AnimatePresence mode="wait">
          {phase === 'search' ? (
            <motion.div
              key="search"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <ShuffleMCP
                apiKey={API_CONFIG.apiKey || undefined}
                apiBaseUrl={API_CONFIG.baseUrl}
                placeholder={`Search ${categoryLabel.toLowerCase()} integrations...`}
                layout="grid"
                gridColumns={3}
                inline={true}
                initialQuery={initialQuery}
                hitsPerPage={9}
                showDescription={true}
                showCategories={true}
                showCheckbox={false}
                multiSelect={false}
                preventDefault={false}
                onAppSelected={handleAppSelected}
                customStyles={singulStyles}
              />
            </motion.div>
          ) : (
            <motion.div
              key="auth"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              {authLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6 }}>
                  <CircularProgress size={28} sx={{ color: 'hsl(var(--primary))' }} />
                </Box>
              ) : selectedApp ? (
                <AppAuthCard
                  app={selectedApp as any}
                  authState={authState}
                  isExpanded={true}
                  onToggle={() => {}}
                  onAuthChange={handleAuthChange}
                  onTestConnection={handleTestConnection}
                  onSaveAuth={handleSaveAuth}
                  apiAuthEntries={authenticatedApps}
                  onRefreshAuth={refreshAuth}
                />
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default AddAppModal;
