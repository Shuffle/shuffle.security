import { Search as SearchIcon, RefreshCw as SyncIcon, Network as AccountTreeIcon, ExternalLink as OpenInNewIcon } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from '@/lib/router-compat';
import {
  Box,
  Typography,
  Button,
  TextField,
  InputAdornment,
  Card,
  CardContent,
  Chip,
  Tabs,
  Tab,
  LinearProgress,
  Alert,
} from '@mui/material';
import { toast } from '@/lib/toast';
import { useMitreAttack } from '@/hooks/useMitreAttack';
import { Skeleton } from '@/components/ui/skeleton';
import { usePageMeta } from '@/hooks/usePageMeta';

const MitreAttackPage = () => {

  usePageMeta({
    title: 'MITRE ATT&CK',
    description: 'Explore the MITRE ATT&CK framework coverage in Shuffle Security.',
    url: '/detection/mitre',
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    tactics,
    techniques,
    isLoading,
    isSyncing,
    error,
    lastUpdated,
    syncFromSource,
    getTechniquesByTactic,
    getSubTechniques,
  } = useMitreAttack();

  const [selectedTacticShortName, setSelectedTacticShortName] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTechniques, setExpandedTechniques] = useState<Set<string>>(new Set());
  const [highlightedTechnique, setHighlightedTechnique] = useState<string | null>(null);
  const techniqueRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const initializedFromUrl = useRef(false);

  // Initialize from URL params when data loads
  useEffect(() => {
    if (tactics.length === 0 || initializedFromUrl.current) return;
    
    const tacticParam = searchParams.get('tactic');
    const techniqueParam = searchParams.get('technique');
    
    if (tacticParam) {
      // Find tactic by shortName or externalId
      const tactic = tactics.find(
        t => t.shortName === tacticParam || t.externalId === tacticParam
      );
      if (tactic) {
        setSelectedTacticShortName(tactic.shortName);
        initializedFromUrl.current = true;
        
        // If technique param exists, expand and scroll to it
        if (techniqueParam) {
          // Normalize technique ID (e.g., T1059.001 -> T1059)
          const parentId = techniqueParam.includes('.') 
            ? techniqueParam.split('.')[0] 
            : techniqueParam;
          
          setExpandedTechniques(new Set([parentId]));
          setHighlightedTechnique(techniqueParam);
          
          // Scroll after render
          setTimeout(() => {
            const ref = techniqueRefs.current[techniqueParam] || techniqueRefs.current[parentId];
            ref?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 100);
        }
        return;
      }
    }
    
    // Default to first tactic if no valid URL param
    if (!selectedTacticShortName && tactics.length > 0) {
      setSelectedTacticShortName(tactics[0].shortName);
      initializedFromUrl.current = true;
    }
  }, [tactics, searchParams, selectedTacticShortName]);

  // Update URL when tactic changes (after initial load)
  const handleTacticChange = (newTacticShortName: string) => {
    setSelectedTacticShortName(newTacticShortName);
    setHighlightedTechnique(null);
    
    const tactic = tactics.find(t => t.shortName === newTacticShortName);
    if (tactic) {
      setSearchParams({ tactic: tactic.externalId }, { replace: true });
    }
  };

  // Navigate to technique with URL update
  const navigateToTechnique = (techniqueId: string, tacticShortName?: string) => {
    if (tacticShortName && tacticShortName !== selectedTacticShortName) {
      setSelectedTacticShortName(tacticShortName);
    }
    
    const parentId = techniqueId.includes('.') ? techniqueId.split('.')[0] : techniqueId;
    setExpandedTechniques(prev => new Set([...prev, parentId]));
    setHighlightedTechnique(techniqueId);
    
    const tactic = tactics.find(t => t.shortName === (tacticShortName || selectedTacticShortName));
    if (tactic) {
      setSearchParams({ tactic: tactic.externalId, technique: techniqueId }, { replace: true });
    }
    
    setTimeout(() => {
      const ref = techniqueRefs.current[techniqueId] || techniqueRefs.current[parentId];
      ref?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  const selectedTactic = tactics.find((t) => t.shortName === selectedTacticShortName);
  const tacticTechniques = selectedTacticShortName
    ? getTechniquesByTactic(selectedTacticShortName)
    : [];

  const filteredTactics = tactics.filter(
    (tactic) =>
      tactic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tactic.externalId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTechniques = tacticTechniques.filter(
    (technique) =>
      technique.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      technique.externalId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSync = async () => {
    const success = await syncFromSource();
    if (success) {
      toast.success('MITRE ATT&CK data synced successfully');
    } else {
      toast.error('Failed to sync MITRE ATT&CK data');
    }
  };

  const toggleSubTechniques = (techniqueId: string) => {
    setExpandedTechniques((prev) => {
      const next = new Set(prev);
      if (next.has(techniqueId)) {
        next.delete(techniqueId);
      } else {
        next.add(techniqueId);
      }
      return next;
    });
  };

  const formatLastUpdated = (timestamp: number | null) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalTechniques = techniques.filter((t) => !t.isSubtechnique).length;
  const totalSubTechniques = techniques.filter((t) => t.isSubtechnique).length;

  return (
    <Box sx={{ p: { xs: 2, sm: 4 }, maxWidth: 1400, width: '100%', mx: 'auto' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 2,
          mb: 4,
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1, flexWrap: 'wrap' }}>
            <AccountTreeIcon size={28} style={{ color: 'hsl(var(--primary))', flexShrink: 0 }} />
            <Typography variant="h4" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))' }}>
              MITRE ATT&CK
            </Typography>
          </Box>
          <Typography sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Browse and map adversary tactics, techniques, and procedures
          </Typography>
          {lastUpdated && (
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Last synced: {formatLastUpdated(lastUpdated)}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', flexShrink: 0 }}>
          <Button
            variant="outlined"
            startIcon={<SyncIcon className={isSyncing ? 'animate-spin' : ''} />}
            onClick={handleSync}
            disabled={isSyncing || isLoading}
            sx={{
              height: 36,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              '&:hover': {
                borderColor: 'hsl(var(--border))',
                backgroundColor: 'hsl(var(--muted))',
              },
            }}
          >
            {isSyncing ? 'Syncing...' : 'Sync from MITRE'}
          </Button>
          <Button
            variant="outlined"
            endIcon={<OpenInNewIcon />}
            component="a"
            href="https://attack.mitre.org/"
            target="_blank"
            sx={{
              height: 36,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              '&:hover': {
                borderColor: 'hsl(var(--border))',
                backgroundColor: 'hsl(var(--muted))',
              },
            }}
          >
            MITRE ATT&CK
          </Button>
        </Box>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Loading Progress */}
      {isLoading && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))', mb: 1 }}>
            Loading MITRE ATT&CK framework...
          </Typography>
          <LinearProgress />
        </Box>
      )}

      {/* Search */}
      <Box sx={{ mb: 3 }}>
        <TextField
          placeholder="Search tactics and techniques..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          size="small"
          sx={{
            width: { xs: '100%', sm: 320 },
            '& .MuiOutlinedInput-root': {
              height: 36,
              backgroundColor: 'hsl(var(--muted))',
              '& fieldset': {
                borderColor: 'hsl(var(--border))',
              },
              '&:hover fieldset': {
                borderColor: 'hsl(var(--border))',
              },
              '&.Mui-focused fieldset': {
                borderColor: 'hsl(var(--primary))',
              },
            },
            '& .MuiOutlinedInput-input': {
              color: 'hsl(var(--foreground))',
              '&::placeholder': {
                color: 'hsl(var(--muted-foreground))',
                opacity: 1,
              },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon size={20} style={{ color: 'hsl(var(--muted-foreground))' }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Card sx={{ 
          backgroundColor: 'hsl(var(--card))', 
          border: '1px solid hsl(var(--border))',
          minWidth: { xs: 110, sm: 140 },
          flex: { xs: '1 1 calc(33.333% - 12px)', sm: '0 0 auto' },
        }}>
          <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
            {isLoading ? (
              <Skeleton className="h-8 w-12 mb-1" />
            ) : (
              <Typography variant="h4" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>
                {tactics.length}
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Tactics
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ 
          backgroundColor: 'hsl(var(--card))', 
          border: '1px solid hsl(var(--border))',
          minWidth: { xs: 110, sm: 140 },
          flex: { xs: '1 1 calc(33.333% - 12px)', sm: '0 0 auto' },
        }}>
          <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
            {isLoading ? (
              <Skeleton className="h-8 w-12 mb-1" />
            ) : (
              <Typography variant="h4" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>
                {totalTechniques}
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Techniques
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ 
          backgroundColor: 'hsl(var(--card))', 
          border: '1px solid hsl(var(--border))',
          minWidth: { xs: 110, sm: 140 },
          flex: { xs: '1 1 calc(33.333% - 12px)', sm: '0 0 auto' },
        }}>
          <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
            {isLoading ? (
              <Skeleton className="h-8 w-12 mb-1" />
            ) : (
              <Typography variant="h4" sx={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}>
                {totalSubTechniques}
              </Typography>
            )}
            <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              Sub-techniques
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Tactics Tabs */}
      {!isLoading && tactics.length > 0 && (
        <Card sx={{ 
          backgroundColor: 'hsl(var(--card))', 
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
          mb: 3,
        }}>
          <Box sx={{ borderBottom: '1px solid hsl(var(--border))' }}>
            <Tabs
              value={selectedTacticShortName}
              onChange={(_, value) => handleTacticChange(value)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                '& .MuiTab-root': {
                  color: 'hsl(var(--muted-foreground))',
                  textTransform: 'none',
                  minHeight: 48,
                  '&.Mui-selected': {
                    color: 'hsl(var(--primary))',
                  },
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: 'hsl(var(--primary))',
                },
              }}
            >
              {filteredTactics.map((tactic) => (
                <Tab
                  key={tactic.id}
                  value={tactic.shortName}
                  label={
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {tactic.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                        {tactic.externalId}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </Tabs>
          </Box>

          {/* Selected Tactic Details */}
          <Box sx={{ p: 3 }}>
            {selectedTactic && (
              <Box sx={{ mb: 3 }}>
                <Typography variant="h6" sx={{ color: 'hsl(var(--foreground))', mb: 1 }}>
                  {selectedTactic.name}
                </Typography>
                <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  {selectedTactic.description?.split('\n')[0] || 'No description available'}
                </Typography>
              </Box>
            )}

            {/* Techniques Grid */}
            <Typography variant="subtitle2" sx={{ color: 'hsl(var(--foreground))', mb: 2 }}>
              Techniques ({filteredTechniques.length})
            </Typography>
            
            {filteredTechniques.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  {searchQuery ? 'No techniques match your search' : 'No techniques for this tactic'}
                </Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 2 }}>
                {filteredTechniques.map((technique) => {
                  const subTechniques = getSubTechniques(technique.externalId);
                  const isExpanded = expandedTechniques.has(technique.externalId);
                  const isHighlighted = highlightedTechnique === technique.externalId;

                  return (
                    <Card
                      key={technique.id}
                      ref={(el) => { techniqueRefs.current[technique.externalId] = el; }}
                      onClick={() => navigateToTechnique(technique.externalId, selectedTacticShortName)}
                      sx={{
                        backgroundColor: isHighlighted 
                          ? 'hsl(var(--primary) / 0.1)' 
                          : 'hsl(var(--muted))',
                        border: isHighlighted 
                          ? '2px solid hsl(var(--primary))' 
                          : '1px solid hsl(var(--border))',
                        transition: 'border-color 0.2s, background-color 0.3s',
                        cursor: 'pointer',
                        '&:hover': {
                          borderColor: 'hsl(var(--primary))',
                          backgroundColor: isHighlighted 
                            ? 'hsl(var(--primary) / 0.15)' 
                            : 'hsl(var(--muted) / 0.8)',
                        },
                      }}
                    >
                      <CardContent sx={{ py: 2, px: 3, '&:last-child': { pb: 2 } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              color: 'hsl(var(--foreground))',
                              fontWeight: 600,
                              cursor: 'pointer',
                              '&:hover': { textDecoration: 'underline' },
                            }}
                            onClick={() => window.open(technique.url, '_blank')}
                          >
                            {technique.name}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                            {subTechniques.length > 0 && (
                              <Chip
                                label={`${subTechniques.length} sub`}
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSubTechniques(technique.externalId);
                                }}
                                sx={{
                                  height: 20,
                                  fontSize: '0.65rem',
                                  backgroundColor: isExpanded
                                    ? 'hsl(var(--primary))'
                                    : 'hsl(var(--secondary))',
                                  color: isExpanded
                                    ? 'hsl(var(--primary-foreground))'
                                    : 'hsl(var(--secondary-foreground))',
                                  cursor: 'pointer',
                                  '&:hover': {
                                    backgroundColor: 'hsl(var(--primary))',
                                    color: 'hsl(var(--primary-foreground))',
                                  },
                                }}
                              />
                            )}
                            <Chip
                              label={technique.externalId}
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigateToTechnique(technique.externalId, selectedTacticShortName);
                              }}
                              sx={{
                                height: 20,
                                fontSize: '0.7rem',
                                backgroundColor: highlightedTechnique === technique.externalId
                                  ? 'hsl(var(--primary))'
                                  : 'hsl(var(--primary) / 0.15)',
                                color: highlightedTechnique === technique.externalId
                                  ? 'hsl(var(--primary-foreground))'
                                  : 'hsl(var(--primary))',
                                border: 'none',
                                cursor: 'pointer',
                                '&:hover': {
                                  backgroundColor: 'hsl(var(--primary))',
                                  color: 'hsl(var(--primary-foreground))',
                                },
                              }}
                            />
                          </Box>
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{
                            color: 'hsl(var(--muted-foreground))',
                            fontSize: '0.8rem',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {technique.description?.split('\n')[0] || 'No description available'}
                        </Typography>

                        {/* Sub-techniques */}
                        {isExpanded && subTechniques.length > 0 && (
                          <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid hsl(var(--border))' }}>
                            <Typography
                              variant="caption"
                              sx={{ color: 'hsl(var(--muted-foreground))', mb: 1, display: 'block' }}
                            >
                              Sub-techniques:
                            </Typography>
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                              {subTechniques.map((sub) => {
                                const isSubHighlighted = highlightedTechnique === sub.externalId;
                                return (
                                  <Box
                                    key={sub.id}
                                    ref={(el) => { techniqueRefs.current[sub.externalId] = el as HTMLDivElement; }}
                                    sx={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      cursor: 'pointer',
                                      py: 0.5,
                                      px: 1,
                                      borderRadius: 1,
                                      backgroundColor: isSubHighlighted 
                                        ? 'hsl(var(--primary) / 0.15)' 
                                        : 'transparent',
                                      border: isSubHighlighted 
                                        ? '1px solid hsl(var(--primary))' 
                                        : '1px solid transparent',
                                      '&:hover': {
                                        '& .sub-name': { textDecoration: 'underline' },
                                      },
                                    }}
                                    onClick={() => window.open(sub.url, '_blank')}
                                  >
                                    <Typography
                                      className="sub-name"
                                      variant="body2"
                                      sx={{ color: 'hsl(var(--foreground))', fontSize: '0.8rem' }}
                                    >
                                      {sub.name}
                                    </Typography>
                                    <Chip
                                      label={sub.externalId}
                                      size="small"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        navigateToTechnique(sub.externalId, selectedTacticShortName);
                                      }}
                                      sx={{
                                        height: 18,
                                        fontSize: '0.65rem',
                                        backgroundColor: isSubHighlighted
                                          ? 'hsl(var(--primary))'
                                          : 'hsl(var(--secondary))',
                                        color: isSubHighlighted
                                          ? 'hsl(var(--primary-foreground))'
                                          : 'hsl(var(--secondary-foreground))',
                                        cursor: 'pointer',
                                        '&:hover': {
                                          backgroundColor: 'hsl(var(--primary))',
                                          color: 'hsl(var(--primary-foreground))',
                                        },
                                      }}
                                    />
                                  </Box>
                                );
                              })}
                            </Box>
                          </Box>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </Box>
            )}
          </Box>
        </Card>
      )}

      {/* Loading skeleton for tabs */}
      {isLoading && (
        <Card sx={{ 
          backgroundColor: 'hsl(var(--card))', 
          border: '1px solid hsl(var(--border))',
          borderRadius: 2,
        }}>
          <Box sx={{ p: 2, borderBottom: '1px solid hsl(var(--border))' }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-32" />
              ))}
            </Box>
          </Box>
          <Box sx={{ p: 3 }}>
            <Skeleton className="h-6 w-48 mb-2" />
            <Skeleton className="h-4 w-full mb-4" />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 2 }}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </Box>
          </Box>
        </Card>
      )}
    </Box>
  );
};

export default MitreAttackPage;
