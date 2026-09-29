import { useState, useRef } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronDown,
  Search,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { ShuffleMCP, type ShuffleMCPHandle } from '../views/ShuffleMCP';
import { API_CONFIG } from '../api';
import type { AlgoliaSearchApp, ShuffleHostProps } from '../shuffle-mcp.helpers';

// Top integration options based on popularity
const popularTools = [
  { 
    id: 'splunk', 
    name: 'Splunk', 
    category: 'SIEM',
    image: 'https://shuffler.io/images/apps/splunk.png',
    searchTerm: 'splunk'
  },
  { 
    id: 'microsoft_sentinel', 
    name: 'Microsoft Sentinel', 
    category: 'SIEM',
    image: 'https://shuffler.io/images/apps/microsoft_sentinel.png',
    searchTerm: 'sentinel'
  },
  { 
    id: 'crowdstrike', 
    name: 'CrowdStrike', 
    category: 'EDR',
    image: 'https://shuffler.io/images/apps/crowdstrike.png',
    searchTerm: 'crowdstrike'
  },
  { 
    id: 'microsoft_defender', 
    name: 'Microsoft Defender', 
    category: 'EDR',
    image: 'https://shuffler.io/images/apps/microsoft_defender.png',
    searchTerm: 'defender'
  },
  { 
    id: 'palo_alto', 
    name: 'Palo Alto', 
    category: 'Firewall',
    image: 'https://shuffler.io/images/apps/palo_alto.png',
    searchTerm: 'palo alto'
  },
  { 
    id: 'servicenow', 
    name: 'ServiceNow', 
    category: 'ITSM',
    image: 'https://shuffler.io/images/apps/servicenow.png',
    searchTerm: 'servicenow'
  },
];

interface PrimaryToolStepProps extends ShuffleHostProps {
  selectedApps: AlgoliaSearchApp[];
  onAppsChange: (apps: AlgoliaSearchApp[]) => void;
  challenge: string | null;
}

export const PrimaryToolStep = ({ 
  selectedApps, 
  onAppsChange,
  challenge,
  globalUrl,
  theme,
  colorMode,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
}: PrimaryToolStepProps) => {
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const singulRef = useRef<ShuffleMCPHandle>(null);

  // Challenge-specific messaging
  const getChallengeContext = () => {
    switch (challenge) {
      case 'alert-fatigue':
        return {
          title: "Where do your alerts come from?",
          subtitle: "We'll help you correlate and deduplicate alerts from this source."
        };
      case 'slow-response':
        return {
          title: "What's your main alert source?",
          subtitle: "We'll automate enrichment and response for incidents from here."
        };
      case 'manual-work':
        return {
          title: "What tool do you use most?",
          subtitle: "We'll connect this with your other tools to eliminate copy-paste."
        };
      default:
        return {
          title: "What's your primary alert source?",
          subtitle: "Start with one integration — you can add more later."
        };
    }
  };

  const context = getChallengeContext();

  const handlePopularToolClick = (tool: typeof popularTools[0]) => {
    // Track app click in onboarding
    import('@/Shuffle-Core/lib/analytics').then(({ trackPredefinedEvent, GA_EVENTS }) => {
      trackPredefinedEvent(GA_EVENTS.ONBOARDING_APP_CLICK, tool.name);
    });
    // Search for this tool in Singul to get the full app data
    if (singulRef.current) {
      singulRef.current.search(tool.searchTerm);
      setSearchQuery(tool.searchTerm);
      setShowSearch(true);
    }
  };

  const isAppSelected = (toolId: string) => {
    return selectedApps.some(app => 
      app.name.toLowerCase().includes(toolId.replace('_', ' ').toLowerCase()) ||
      app.objectID.toLowerCase().includes(toolId.toLowerCase())
    );
  };

  return (
    <Box sx={{ py: { xs: 2, md: 4 } }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            mb: 1,
            color: 'hsl(var(--foreground))',
            textAlign: 'center',
          }}
        >
          {context.title}
        </Typography>
        <Typography
          variant="body1"
          sx={{
            color: 'hsl(var(--muted-foreground))',
            mb: 5,
            textAlign: 'center',
          }}
        >
          {context.subtitle}
        </Typography>
      </motion.div>

      {/* Popular Tools Grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)' },
          gap: 2,
          maxWidth: 700,
          mx: 'auto',
          mb: 4,
        }}
      >
        {popularTools.map((tool, index) => {
          const isSelected = isAppSelected(tool.id);
          
          return (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <Box
                onClick={() => handlePopularToolClick(tool)}
                sx={{
                  p: 3,
                  borderRadius: 3,
                  cursor: 'pointer',
                  backgroundColor: isSelected 
                    ? 'hsl(var(--primary) / 0.12)' 
                    : 'transparent',
                  border: '1px solid',
                  borderColor: isSelected 
                    ? 'hsl(var(--primary))' 
                    : 'hsl(var(--border))',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                  '&:hover': {
                    borderColor: isSelected ? 'hsl(var(--primary))' : 'hsl(var(--primary) / 0.4)',
                    backgroundColor: isSelected 
                      ? 'hsl(var(--primary) / 0.15)' 
                      : 'hsl(var(--muted))',
                    transform: 'translateY(-2px)',
                  },
                }}
              >
                {isSelected && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      color: 'hsl(var(--severity-low))',
                    }}
                  >
                    <CheckCircle2 size={18} />
                  </Box>
                )}
                
                <Box
                  component="img"
                  src={tool.image}
                  alt={tool.name}
                  sx={{
                    width: 48,
                    height: 48,
                    borderRadius: 2,
                    objectFit: 'contain',
                    backgroundColor: 'hsl(var(--muted))',
                    p: 1,
                    mx: 'auto',
                    display: 'block',
                    mb: 2,
                  }}
                />
                
                <Typography
                  variant="subtitle2"
                  sx={{
                    color: 'hsl(var(--foreground))',
                    fontWeight: 600,
                    textAlign: 'center',
                    mb: 0.5,
                  }}
                >
                  {tool.name}
                </Typography>
                
                <Typography
                  variant="caption"
                  sx={{
                    color: 'hsl(var(--muted-foreground))',
                    textAlign: 'center',
                    display: 'block',
                  }}
                >
                  {tool.category}
                </Typography>
              </Box>
            </motion.div>
          );
        })}
      </Box>

      {/* "Don't see yours?" expander */}
      <Box sx={{ textAlign: 'center', mb: 4 }}>
        <Box
          onClick={() => setShowSearch(!showSearch)}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 3,
            py: 1.5,
            cursor: 'pointer',
            color: 'hsl(var(--muted-foreground))',
            borderRadius: 2,
            transition: 'all 0.2s ease',
            '&:hover': {
              color: 'hsl(var(--primary))',
              backgroundColor: 'hsl(var(--primary) / 0.08)',
            },
          }}
        >
          <Search size={16} />
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {showSearch ? 'Hide search' : "Don't see your tool? Search 3,000+ integrations"}
          </Typography>
          <motion.div
            animate={{ rotate: showSearch ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={16} />
          </motion.div>
        </Box>
      </Box>

      {/* Expanded Search */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Box
              sx={{
                maxWidth: 800,
                mx: 'auto',
                p: 3,
                backgroundColor: 'transparent',
                border: '1px solid hsl(var(--border))',
                borderRadius: 3,
              }}
            >
              <ShuffleMCP
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
                placeholder="Search all integrations..."
                layout="grid"
                gridColumns={3}
                inline={true}
                initialQuery={searchQuery}
                hitsPerPage={24}
                showDescription={false}
                showCategories={true}
                showCheckbox={true}
                multiSelect={true}
                preventDefault={true}
                selectedApps={selectedApps}
                onSelectionChange={onAppsChange}
                onSearchChange={setSearchQuery}
                customStyles={{
                  container: { width: '100%' },
                  inputWrapper: {
                    backgroundColor: 'hsl(var(--background-elevated))',
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
                  resultsContainer: { marginTop: '16px', gap: '12px' },
                  dropdownItem: {
                    backgroundColor: 'transparent',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '12px',
                    padding: '16px',
                    color: 'hsl(var(--foreground))',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  },
                  dropdownItemHover: {
                    borderColor: 'hsl(var(--primary) / 0.5)',
                    backgroundColor: 'hsl(var(--muted))',
                  },
                  selectedItem: {
                    backgroundColor: 'hsl(var(--primary) / 0.1)',
                    borderColor: 'hsl(var(--primary))',
                  },
                  appIcon: {
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: 'hsl(var(--muted))',
                    objectFit: 'contain' as const,
                    padding: '4px',
                  },
                  appName: { fontSize: '14px', fontWeight: 600, color: 'hsl(var(--foreground))' },
                  appCategory: {
                    marginTop: '8px',
                    padding: '2px 8px',
                    backgroundColor: 'hsl(var(--muted))',
                    color: 'hsl(var(--muted-foreground))',
                    fontSize: '10px',
                    fontWeight: 600,
                    textTransform: 'uppercase' as const,
                    borderRadius: '4px',
                  },
                  checkbox: { border: '2px solid hsl(var(--border))' },
                  checkboxChecked: { backgroundColor: 'hsl(var(--primary))', borderColor: 'hsl(var(--primary))' },
                  emptyState: {
                    padding: '32px',
                    color: 'hsl(var(--muted-foreground))',
                    textAlign: 'center' as const,
                    fontSize: '14px',
                    backgroundColor: 'hsl(var(--muted))',
                    borderRadius: '12px',
                    border: '1px solid hsl(var(--border))',
                    gridColumn: '1 / -1',
                  },
                }}
              />
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected Apps Display */}
      {selectedApps.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Box 
            sx={{ 
              mt: 4, 
              p: 3, 
              backgroundColor: 'hsl(var(--severity-low) / 0.08)',
              border: '1px solid hsl(var(--severity-low) / 0.2)',
              borderRadius: 3,
              maxWidth: 600,
              mx: 'auto',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
              <Sparkles size={18} color="hsl(var(--severity-low))" />
              <Typography variant="body2" sx={{ color: 'hsl(var(--severity-low))', fontWeight: 600 }}>
                {selectedApps.length === 1 ? 'Great choice!' : `${selectedApps.length} tools selected`}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {selectedApps.map((app) => (
                <Chip
                  key={app.objectID}
                  label={app.name.replace(/_/g, ' ')}
                  avatar={
                    app.image_url ? (
                      <Box
                        component="img"
                        src={app.image_url}
                        alt={app.name}
                        sx={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          objectFit: 'contain',
                          backgroundColor: 'hsl(var(--muted))',
                        }}
                      />
                    ) : undefined
                  }
                  onDelete={() => {
                    onAppsChange(selectedApps.filter(a => a.objectID !== app.objectID));
                  }}
                  sx={{
                    backgroundColor: 'hsl(var(--muted))',
                    border: '1px solid hsl(var(--border))',
                    color: 'hsl(var(--foreground))',
                    fontWeight: 500,
                    '& .MuiChip-avatar': { marginLeft: '4px' },
                    '& .MuiChip-deleteIcon': {
                      color: 'hsl(var(--muted-foreground))',
                      '&:hover': { color: 'hsl(var(--foreground))' },
                    },
                  }}
                />
              ))}
            </Box>
          </Box>
        </motion.div>
      )}
    </Box>
  );
};
