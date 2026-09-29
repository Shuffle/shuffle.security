import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Chip,
  Collapse,
  Button,
} from '@mui/material';
import { motion } from 'framer-motion';
import {
  Mail,
  Radar,
  Search,
  Ticket,
  LayoutGrid,
  ChevronDown,
  CheckCircle2,
  Plus as PlusIcon,
} from 'lucide-react';
import {
  API_CONFIG,
  getApiUrl,
  getAuthHeader,
  getIngestionCategory,
  invalidateAppsCache,
  refreshAllIntegrationStatus,
} from '@shuffleio/shuffle-mcps';
import type {
  AlgoliaSearchApp,
  ShuffleHostProps,
} from '../shuffle-mcp.helpers';
import type {
  IngestionCategory,
} from '@shuffleio/shuffle-mcps';
import { ShuffleMCP, type ShuffleMCPHandle } from '../views/ShuffleMCP';
import { AddAppButton, AddAppDialog } from '@/Shuffle-Core/components/AddAppDialog';

/** Fire-and-forget activate call for a newly selected app. Refreshes the
 *  Integrations bar so the icon flips to "enabled" immediately. */
const activateApp = (appId: string) => {
  fetch(getApiUrl(`/api/v1/apps/${encodeURIComponent(appId)}/activate`), {
    method: 'GET',
    credentials: 'include',
    headers: { ...getAuthHeader() },
  })
    .then((res) => {
      if (!res.ok) return;
      invalidateAppsCache();
      refreshAllIntegrationStatus();
    })
    .catch(() => {
      // Non-critical
    });
};

// Extended category type for the Sources page (includes 'other')
type SourceCategory = IngestionCategory | 'other';

// Category definitions
const CATEGORIES: {
  id: SourceCategory;
  label: string;
  description: string;
  searchTerm: string;
  icon: typeof Mail;
}[] = [
  { id: 'email', label: 'Email', description: 'Inboxes & mail servers', searchTerm: 'Communication', icon: Mail },
  { id: 'siem', label: 'SIEM', description: 'Log aggregation & analytics', searchTerm: 'siem', icon: Radar },
  { id: 'edr', label: 'EDR', description: 'Endpoint detection & response', searchTerm: 'edr', icon: Search },
  { id: 'cases', label: 'Cases', description: 'Ticketing & case management', searchTerm: 'cases', icon: Ticket },
  { id: 'other', label: 'Other', description: 'Any other tools & integrations', searchTerm: '', icon: LayoutGrid },
];

// Shared Singul custom styles
const singulStyles = {
  container: { width: '100%' },
  inputWrapper: {
    backgroundColor: 'hsl(var(--input))',
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
  resultsContainer: { marginTop: '12px', gap: '10px', paddingBottom: '16px' },
  dropdownItem: {
    backgroundColor: 'hsl(var(--input))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '10px',
    padding: '10px 12px',
    color: 'hsl(var(--foreground))',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  dropdownItemHover: {
    borderColor: 'hsl(var(--primary) / 0.5)',
    backgroundColor: 'hsl(var(--accent) / 0.08)',
  },
  selectedItem: {
    backgroundColor: 'hsl(var(--primary) / 0.1)',
    borderColor: 'hsl(var(--primary))',
  },
  appIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    backgroundColor: 'hsl(var(--muted))',
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
    backgroundColor: 'hsl(var(--muted))',
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
    backgroundColor: 'hsl(var(--muted))',
    borderRadius: '12px',
    border: '1px solid hsl(var(--border))',
    gridColumn: '1 / -1',
  },
};

// ─── CategorySection ────────────────────────────────────────────────────────

interface CategorySectionProps extends ShuffleHostProps {
  category: typeof CATEGORIES[number];
  stepIndex: number;
  totalSteps: number;
  selectedApps: AlgoliaSearchApp[];
  onAppsChange: (apps: AlgoliaSearchApp[]) => void;
  allSelectedApps: AlgoliaSearchApp[];
  isOpen: boolean;
  onToggleOpen: () => void;
  sectionRef?: React.Ref<HTMLDivElement>;
}

const CategorySection = ({
  category,
  stepIndex,
  totalSteps,
  selectedApps,
  onAppsChange,
  allSelectedApps,
  isOpen,
  onToggleOpen,
  sectionRef,
  globalUrl,
  theme,
  colorMode,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
}: CategorySectionProps) => {
  const singulRef = useRef<ShuffleMCPHandle>(null);
  const [singulKey, setSingulKey] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addSeed, setAddSeed] = useState('');

  const handleAppCreated = useCallback(
    (
      appId: string,
      app?: { name?: string; image_url?: string; categories?: string[] },
    ) => {
      activateApp(appId);
      invalidateAppsCache();
      refreshAllIntegrationStatus();
      const already = allSelectedApps.some((a) => a.objectID === appId);
      if (!already) {
        const next: AlgoliaSearchApp = {
          objectID: appId,
          name: app?.name || appId,
          image_url: app?.image_url || '',
          description: '',
          categories: app?.categories || [],
          creator: '',
          app_version: '1.0.0',
          time_edited: 0,
          generated: false,
          invalid: false,
          priority: 0,
          actions: 0,
          tags: [],
          accessible_by: [],
          action_labels: [],
          triggers: [],
          verified: true,
        } as any;
        onAppsChange([...allSelectedApps, next]);
      }
      setSingulKey((k) => k + 1);
    },
    [allSelectedApps, onAppsChange],
  );

  const renderNewAppChip = () => (
    <Button
      size="small"
      onClick={(e) => {
        e.stopPropagation();
        setAddSeed('');
        setAddOpen(true);
      }}
      startIcon={<PlusIcon size={12} />}
      sx={{
        textTransform: 'none',
        fontSize: '0.72rem',
        fontWeight: 600,
        height: 26,
        minHeight: 26,
        px: 1.25,
        borderRadius: 999,
        color: 'hsl(var(--muted-foreground))',
        bgcolor: 'transparent',
        border: '1px solid hsl(var(--border))',
        '& .MuiButton-startIcon': { color: 'hsl(var(--primary))' },
        '&:hover': {
          bgcolor: 'hsl(var(--muted) / 0.5)',
          borderColor: 'hsl(var(--primary) / 0.5)',
          color: 'hsl(var(--foreground))',
        },
      }}
    >
      New App
    </Button>
  );

  const Icon = category.icon;
  const hasSelections = selectedApps.length > 0;
  const isLast = stepIndex === totalSteps - 1;

  // When the section opens (or is remounted via singulKey), auto-focus the
  // search input and select any existing text so the user can immediately
  // start typing to overwrite the pre-filled category query.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      singulRef.current?.focus(true);
    }, 260); // wait for Collapse expand animation
    return () => clearTimeout(t);
  }, [isOpen, singulKey]);


  return (
    <Box
      ref={sectionRef}
      sx={{ display: 'flex', gap: 0 }}
    >
      {/* ── Vertical stepper rail ── */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: 44,
          flexShrink: 0,
          pt: 0.25,
        }}
      >
        {/* Step circle */}
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            backgroundColor: isOpen
              ? 'hsl(var(--primary) / 0.15)'
              : hasSelections
                ? 'hsl(var(--severity-low) / 0.15)'
                : 'hsl(var(--muted))',
            border: '2px solid',
            borderColor: isOpen
              ? 'hsl(var(--primary) / 0.5)'
              : hasSelections
                ? 'hsl(var(--severity-low) / 0.4)'
                : 'hsl(var(--border))',
            transition: 'all 0.3s ease',
            zIndex: 1,
          }}
        >
          {hasSelections && !isOpen ? (
            <CheckCircle2 size={18} color="hsl(var(--severity-low))" />
          ) : (
            <Icon size={18} color={isOpen ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
          )}
        </Box>
        {/* Connector line */}
        {!isLast && (
          <Box
            sx={{
              width: 2,
              flex: 1,
              minHeight: 16,
              backgroundColor: hasSelections
                ? 'hsl(var(--severity-low) / 0.3)'
                : 'hsl(var(--border))',
              transition: 'background-color 0.3s ease',
            }}
          />
        )}
      </Box>

      {/* ── Content area ── */}
      <Box sx={{ flex: 1, minWidth: 0, pb: isLast ? 0 : 2 }}>
        {/* Clickable header */}
        <Box
          onClick={() => {
            if (isOpen) setSingulKey(k => k + 1);
            onToggleOpen();
          }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            py: 0.75,
            px: 1.5,
            ml: 1,
            cursor: 'pointer',
            borderRadius: 2,
            transition: 'background-color 0.2s ease',
            '&:hover': {
              backgroundColor: 'hsl(var(--muted))',
            },
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                color: isOpen ? 'hsl(var(--primary))' : hasSelections ? 'hsl(var(--severity-low))' : 'hsl(var(--foreground))',
                fontWeight: 600,
                fontSize: '0.95rem',
                lineHeight: 1.3,
                transition: 'color 0.2s ease',
              }}
            >
              {category.label}
            </Typography>
            <Typography
              sx={{
                color: 'hsl(var(--muted-foreground))',
                fontSize: '0.75rem',
                lineHeight: 1.3,
              }}
            >
              {category.description}
            </Typography>
          </Box>

          {/* Status chip + avatars */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
            {hasSelections && (
              <Chip
                icon={<CheckCircle2 size={14} />}
                label={`${selectedApps.length} selected`}
                size="small"
                sx={{
                  height: 24,
                  backgroundColor: 'hsl(var(--severity-low) / 0.15)',
                  color: 'hsl(var(--severity-low))',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  '& .MuiChip-icon': { color: 'hsl(var(--severity-low))' },
                }}
              />
            )}

            {!isOpen && hasSelections && (
              <Box sx={{ display: 'flex' }}>
                {selectedApps.slice(0, 3).map((app, idx) => (
                  <Box
                    key={app.objectID}
                    component="img"
                    src={app.image_url}
                    alt={app.name}
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      objectFit: 'contain',
                      backgroundColor: 'hsl(var(--muted))',
                      border: '2px solid hsl(var(--card))',
                      ml: idx > 0 ? -0.75 : 0,
                      p: 0.25,
                    }}
                  />
                ))}
                {selectedApps.length > 3 && (
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      backgroundColor: 'hsl(var(--muted))',
                      border: '2px solid hsl(var(--card))',
                      ml: -0.75,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography sx={{ fontSize: '0.55rem', color: 'hsl(var(--muted-foreground))' }}>
                      +{selectedApps.length - 3}
                    </Typography>
                  </Box>
                )}
              </Box>
            )}

            <motion.div
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown size={18} color="hsl(var(--muted-foreground))" />
            </motion.div>
          </Box>
        </Box>

        {/* Expandable content */}
        <Collapse in={isOpen}>
          <Box
            sx={{
              ml: 1,
              mt: 1.5,
              p: 2.5,
              borderRadius: 3,
              border: '1px solid hsl(var(--border))',
              backgroundColor: 'transparent',
              transition: 'border-color 0.3s ease',
              '& .singul-results-container': {
                maxHeight: '300px !important',
              },
            }}
          >
            <ShuffleMCP
              key={singulKey}
              ref={singulRef}
              globalUrl={globalUrl}
              theme={theme}
              colorMode={colorMode}
              userdata={userdata}
              isLoaded={isLoaded}
              isLoggedIn={isLoggedIn}
              serverside={serverside}
              apiKey={API_CONFIG.apiKey || undefined}
              apiBaseUrl={API_CONFIG.baseUrl}
              placeholder={`Search ${category.label.toLowerCase()} integrations...`}
              layout="grid"
              gridColumns={3}
              inline={true}
              initialQuery={category.searchTerm}
              hitsPerPage={24}
              showDescription={false}
              showCategories={true}
              showCheckbox={true}
              multiSelect={true}
              preventDefault={true}
              selectedApps={allSelectedApps}
              onSelectionChange={onAppsChange}
              customStyles={singulStyles}
              renderInputEndAdornment={renderNewAppChip}
              renderEmptyState={(query: string) => (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.25, width: '100%' }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', textAlign: 'center' }}>
                    No integrations match "{query}".
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => { setAddSeed(query); setAddOpen(true); }}
                    startIcon={<PlusIcon size={14} />}
                    sx={{
                      textTransform: 'none',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      height: 32,
                      px: 1.5,
                      borderRadius: 999,
                      color: 'hsl(var(--muted-foreground))',
                      border: '1px solid hsl(var(--border))',
                      bgcolor: 'transparent',
                      maxWidth: '100%',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      '& .MuiButton-startIcon': { color: 'hsl(var(--primary))' },
                      '&:hover': {
                        bgcolor: 'hsl(var(--muted) / 0.5)',
                        borderColor: 'hsl(var(--primary) / 0.5)',
                        color: 'hsl(var(--foreground))',
                      },
                    }}
                  >
                    Try building "{query}" as a new app
                  </Button>
                </Box>
              )}
              renderEndOfResults={() => (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, py: 1 }}>
                  <Typography sx={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))' }}>
                    Cannot find what you are looking for?
                  </Typography>
                  <AddAppButton
                    size="small"
                    label="Generate the app"
                    onCreated={handleAppCreated}
                  />
                </Box>
              )}
            />
            <AddAppDialog
              open={addOpen}
              onOpenChange={setAddOpen}
              initialInput={addSeed}
              onCreated={handleAppCreated}
            />
          </Box>
        </Collapse>
      </Box>
    </Box>
  );
};

// ─── UnifiedSourceSetup ─────────────────────────────────────────────────────

interface UnifiedSourceSetupProps extends ShuffleHostProps {
  selectedApps: AlgoliaSearchApp[];
  onAppsChange: (apps: AlgoliaSearchApp[]) => void;
}

export const UnifiedSourceSetup = ({
  selectedApps,
  onAppsChange,
  globalUrl,
  theme,
  colorMode,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
}: UnifiedSourceSetupProps) => {
  // Only one category open at a time (accordion)
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  // Refs for scrolling to sections
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToSection = useCallback((id: string) => {
    setTimeout(() => {
      const el = sectionRefs.current[id];
      if (!el) return;
      const scrollParent = el.closest('main') || el.closest('[style*="overflow"]') || el.parentElement?.closest('div[class*="MuiBox"]');
      if (scrollParent) {
        const elTop = el.getBoundingClientRect().top - scrollParent.getBoundingClientRect().top + scrollParent.scrollTop;
        scrollParent.scrollTo({ top: elTop - 80, behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 200);
  }, []);

  // Track previous selected IDs to detect new additions
  const prevSelectedIdsRef = useRef(new Set(selectedApps.map(a => a.objectID)));

  const handleAppsChange = useCallback((newApps: AlgoliaSearchApp[]) => {
    // Detect newly added apps and activate them
    const prevIds = prevSelectedIdsRef.current;
    for (const app of newApps) {
      if (!prevIds.has(app.objectID)) {
        activateApp(app.objectID);
      }
    }
    prevSelectedIdsRef.current = new Set(newApps.map(a => a.objectID));
    onAppsChange(newApps);
  }, [onAppsChange]);

  const toggleCategory = (id: string) => {
    const willOpen = openCategory !== id;
    setOpenCategory(prev => (prev === id ? null : id));
    if (willOpen) scrollToSection(id);
  };

  // Categorize selected apps
  const categorizedApps = useMemo(() => {
    const result: Record<SourceCategory, AlgoliaSearchApp[]> = {
      email: [],
      siem: [],
      edr: [],
      cases: [],
      other: [],
    };

    selectedApps.forEach(app => {
      const category = getIngestionCategory(app.name, app.categories);
      if (category) {
        result[category].push(app);
      } else {
        result.other.push(app);
      }
    });

    return result;
  }, [selectedApps]);

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h5"
          sx={{ color: 'hsl(var(--foreground))', fontWeight: 700, mb: 1 }}
        >
          Select Your Sources
        </Typography>
        <Typography
          variant="body1"
          sx={{ color: 'hsl(var(--muted-foreground))', mb: 0 }}
        >
          Choose the tools you use in each category. You will configure credentials in the next step.
        </Typography>
      </Box>

      {/* Category Sections — vertical stepper */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {CATEGORIES.map((category, idx) => (
          <CategorySection
            key={category.id}
            category={category}
            stepIndex={idx}
            totalSteps={CATEGORIES.length}
            selectedApps={categorizedApps[category.id]}
            allSelectedApps={selectedApps}
            onAppsChange={handleAppsChange}
            globalUrl={globalUrl}
            theme={theme}
            colorMode={colorMode}
            userdata={userdata}
            isLoaded={isLoaded}
            isLoggedIn={isLoggedIn}
            serverside={serverside}
            isOpen={openCategory === category.id}
            onToggleOpen={() => toggleCategory(category.id)}
            sectionRef={(el) => { sectionRefs.current[category.id] = el; }}
          />
        ))}
      </Box>
    </Box>
  );
};
