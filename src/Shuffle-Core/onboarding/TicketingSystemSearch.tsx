import { useRef } from 'react';
import {
  Box,
  Typography,
  Chip,
} from '@mui/material';
import { Mail, Radar, Search, Globe, Ticket } from 'lucide-react';
import { ShuffleMCP, type ShuffleMCPHandle } from '../views/ShuffleMCP';
import { API_CONFIG } from '../api';
import type { AlgoliaSearchApp, ShuffleHostProps } from '../shuffle-mcp.helpers';

interface TicketingSystemSearchProps extends ShuffleHostProps {
  selectedApps: AlgoliaSearchApp[];
  onAppsChange: (apps: AlgoliaSearchApp[]) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
}

export const TicketingSystemSearch = ({ 
  selectedApps,
  onAppsChange,
  searchQuery,
  onSearchQueryChange,
  globalUrl,
  theme,
  colorMode,
  userdata,
  isLoaded,
  isLoggedIn,
  serverside,
}: TicketingSystemSearchProps) => {
  const singulRef = useRef<ShuffleMCPHandle>(null);

  const mainCategories = [
    { id: 'email', label: 'Email', icon: Mail, description: 'Inboxes & mail servers', searchTerm: 'email' },
    { id: 'siem', label: 'SIEM', icon: Radar, description: 'Log aggregation', searchTerm: 'siem' },
    { id: 'edr', label: 'EDR', icon: Search, description: 'Endpoint detection', searchTerm: 'edr' },
    { id: 'cases', label: 'Cases', icon: Ticket, description: 'Ticketing & support', searchTerm: 'cases' },
  ];

  const catchAllCategory = { id: 'other', label: 'Anywhere Else', icon: Globe, description: 'Browse all available integrations', searchTerm: '' };

  const allCategories = [...mainCategories, catchAllCategory];

  const getActiveCategory = () => {
    const lowerQuery = searchQuery.toLowerCase().trim();
    if (lowerQuery === '') return 'other';
    return allCategories.find(c => c.searchTerm && c.searchTerm.toLowerCase() === lowerQuery)?.id || null;
  };

  const activeCategory = getActiveCategory();

  return (
    <Box>
      <Typography
        variant="h5"
        sx={{
          color: 'hsl(var(--foreground))',
          fontWeight: 700,
          mb: 1,
        }}
      >
        Connect Your Source Data
      </Typography>
      <Typography
        variant="body1"
        sx={{ color: 'hsl(var(--muted-foreground))', mb: 4 }}
      >
        Search and connect integrations from any of these ingest areas.
      </Typography>

      {/* Main Categories */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 2,
        }}
      >
        {mainCategories.map((category) => {
          const isActive = activeCategory === category.id;
          return (
            <Box
              key={category.id}
              sx={{
                p: 3,
                backgroundColor: isActive ? 'hsl(var(--primary) / 0.1)' : 'transparent',
                border: '1px solid',
                borderColor: isActive ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                borderRadius: 3,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                textAlign: 'center',
                '&:hover': {
                  borderColor: 'hsl(var(--primary) / 0.5)',
                  backgroundColor: isActive ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
                },
              }}
              onClick={() => {
                const term = category.searchTerm || '';
                onSearchQueryChange(term);
                if (singulRef.current) {
                  singulRef.current.search(term);
                }
              }}
            >
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: isActive ? 'hsl(var(--primary) / 0.2)' : 'hsl(var(--muted))',
                  border: '2px solid',
                  borderColor: isActive ? 'hsl(var(--primary))' : 'hsl(var(--border))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 1.5,
                  transition: 'all 0.3s ease',
                }}
              >
                <category.icon size={22} color={isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
              </Box>
              <Typography
                variant="subtitle1"
                sx={{ color: 'hsl(var(--foreground))', fontWeight: 600, mb: 0.5 }}
              >
                {category.label}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'hsl(var(--muted-foreground))', display: 'block' }}
              >
                {category.description}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Catch-all Category */}
      <Box
        sx={{
          p: 2,
          backgroundColor: activeCategory === catchAllCategory.id ? 'hsl(var(--primary) / 0.1)' : 'transparent',
          border: '1px solid',
          borderColor: activeCategory === catchAllCategory.id ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          borderRadius: 2,
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1.5,
          mb: 4,
          '&:hover': {
            borderColor: 'hsl(var(--primary) / 0.4)',
            backgroundColor: activeCategory === catchAllCategory.id ? 'hsl(var(--primary) / 0.15)' : 'hsl(var(--muted))',
          },
        }}
        onClick={() => {
          onSearchQueryChange('');
          if (singulRef.current) {
            singulRef.current.search('');
          }
        }}
      >
        <catchAllCategory.icon size={18} color={activeCategory === catchAllCategory.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'} />
        <Typography
          variant="body2"
          sx={{ 
            color: activeCategory === catchAllCategory.id ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))', 
            fontWeight: 500,
          }}
        >
          {catchAllCategory.label} — {catchAllCategory.description}
        </Typography>
      </Box>

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
        placeholder="Search all available integrations..."
        layout="grid"
        gridColumns={3}
        inline={true}
        initialQuery="Communication"
        hitsPerPage={39}
        showDescription={false}
        showCategories={true}
        showCheckbox={true}
        multiSelect={true}
        preventDefault={true}
        selectedApps={selectedApps}
        onSelectionChange={(apps: any) => {
          onAppsChange(apps);
        }}
        onSearchChange={(query: string) => {
          onSearchQueryChange(query);
        }}
        customStyles={{
          container: { 
            width: '100%',
          },
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
          searchIcon: {
            color: 'hsl(var(--muted-foreground))',
          },
          spinner: {
            borderColor: 'hsl(var(--border))',
            borderTopColor: 'hsl(var(--primary))',
          },
          resultsContainer: {
            marginTop: '16px',
            gap: '12px',
          },
          dropdownItem: {
            backgroundColor: 'transparent',
            border: '1px solid hsl(var(--border))',
            borderRadius: '12px',
            padding: '16px',
            color: 'hsl(var(--foreground))',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          },
          dropdownItemHover: {
            borderColor: 'hsl(var(--primary) / 0.5)',
            backgroundColor: 'hsl(var(--muted) / 0.5)',
            transform: 'translateY(-2px)',
          },
          selectedItem: {
            backgroundColor: 'hsl(var(--primary) / 0.1)',
            borderColor: 'hsl(var(--primary))',
          },
          appInfo: {
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
          },
          appIcon: {
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            backgroundColor: 'hsl(var(--muted) / 0.5)',
            objectFit: 'contain' as const,
            padding: '4px',
          },
          appDetails: {
            display: 'flex',
            flexDirection: 'column' as const,
            gap: '4px',
            flex: 1,
          },
          appName: {
            fontSize: '14px',
            fontWeight: 600,
            color: 'hsl(var(--foreground))',
          },
          appDescription: {
            fontSize: '12px',
            color: 'hsl(var(--muted-foreground))',
            lineHeight: 1.4,
          },
          appCategory: {
            marginTop: '8px',
            padding: '2px 8px',
            backgroundColor: 'hsl(var(--muted))',
            color: 'hsl(var(--muted-foreground))',
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
            borderRadius: '4px',
            display: 'inline-block',
            width: 'fit-content',
          },
          checkbox: {
            border: '2px solid hsl(var(--border))',
          },
          checkboxChecked: {
            backgroundColor: 'hsl(var(--primary))',
            borderColor: 'hsl(var(--primary))',
          },
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

      {/* Selected Apps Display */}
      {selectedApps.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography
            variant="body2"
            sx={{ color: 'hsl(var(--muted-foreground))', mb: 2 }}
          >
            Selected integrations ({selectedApps.length}):
          </Typography>
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
                        backgroundColor: 'hsl(var(--muted) / 0.6)',
                      }}
                    />
                  ) : undefined
                }
                onDelete={() => {
                  onAppsChange(selectedApps.filter(a => a.objectID !== app.objectID));
                }}
                sx={{
                  backgroundColor: 'hsl(var(--muted) / 0.5)',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                  fontWeight: 500,
                  '& .MuiChip-avatar': {
                    marginLeft: '4px',
                  },
                  '& .MuiChip-deleteIcon': {
                    color: 'hsl(var(--muted-foreground))',
                    '&:hover': { color: 'hsl(var(--foreground))' },
                  },
                }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
};
