import { Search as SearchIcon, ExternalLink as OpenInNewIcon, CheckCircle2 as CheckCircleIcon, HelpCircle as HelpOutlineIcon } from 'lucide-react';
import { useState, type MouseEvent } from 'react';
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText, Tooltip, CircularProgress, Divider, Typography } from '@mui/material';
import { getDatastoreItem } from '@/Shuffle-Core/datastore';
import { toast } from '@/lib/toast';

interface ObservableLookupMenuProps {
  type: string;
  value: string;
}

/**
 * Returns a VirusTotal GUI URL for the given observable type, or null if
 * VirusTotal does not have a dedicated browseable view for that type.
 *
 * VT supports four addressable resource types via the GUI: file (hash),
 * url, domain, ip-address. Everything else is best-effort omitted so we
 * do not surface a broken / generic search link as a "lookup".
 */
const virustotalUrlFor = (type: string, value: string): string | null => {
  const t = (type || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const v = value.trim();
  if (!v) return null;
  if (['md5', 'sha1', 'sha256', 'sha512', 'filehash', 'hash', 'imphash', 'ssdeep'].includes(t)) {
    return `https://www.virustotal.com/gui/file/${encodeURIComponent(v)}`;
  }
  if (['url', 'uri'].includes(t)) {
    // VT's URL view requires a sha256 of the URL; the search route resolves
    // to the same detail page and works directly with the raw URL.
    return `https://www.virustotal.com/gui/search/${encodeURIComponent(v)}`;
  }
  if (['domain', 'host', 'hostname', 'fqdn'].includes(t)) {
    return `https://www.virustotal.com/gui/domain/${encodeURIComponent(v)}`;
  }
  if (['ip', 'ipv4', 'ipv6', 'ipaddr', 'ipaddress', 'ipv4addr', 'ipv6addr', 'sourceip', 'destip', 'destinationip']
    .includes(t)) {
    return `https://www.virustotal.com/gui/ip-address/${encodeURIComponent(v)}`;
  }
  return null;
};

export const ObservableLookupMenu = ({ type, value }: ObservableLookupMenuProps) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const open = Boolean(anchorEl);

  const vtUrl = virustotalUrlFor(type, value);

  const handleOpen = (e: MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
  };
  const handleClose = (e?: MouseEvent | object) => {
    if (e && 'stopPropagation' in (e as MouseEvent)) (e as MouseEvent).stopPropagation();
    setAnchorEl(null);
  };

  const lookupInShuffle = async (e: MouseEvent) => {
    e.stopPropagation();
    setShuffleLoading(true);
    const category = `ioc_${type}`;
    try {
      const res = await getDatastoreItem(value, category);
      const found = !!res?.item?.value;
      if (found) {
        toast.success(`Match found in Shuffle (${category})`);
      } else {
        toast.info(`No match for this ${type} in Shuffle (${category})`);
      }
    } catch {
      toast.info(`No match for this ${type} in Shuffle (ioc_${type})`);
    } finally {
      setShuffleLoading(false);
      setAnchorEl(null);
    }
  };

  return (
    <>
      <Tooltip title="Look up this observable" arrow>
        <IconButton
          size="small"
          onClick={handleOpen}
          sx={{
            p: 0.5,
            color: 'hsl(var(--muted-foreground))',
            '&:hover': { color: 'hsl(var(--primary))', bgcolor: 'hsl(var(--primary) / 0.08)' },
          }}
        >
          <SearchIcon size={16} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{
          sx: {
            bgcolor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            minWidth: 260,
          },
        }}
      >
        <Typography
          variant="caption"
          sx={{
            display: 'block',
            px: 1.5,
            pt: 0.75,
            pb: 0.5,
            color: 'hsl(var(--muted-foreground))',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            fontSize: '0.6rem',
            fontWeight: 700,
          }}
        >
          Look up {type}
        </Typography>
        <MenuItem onClick={lookupInShuffle} disabled={shuffleLoading} sx={{ fontSize: '0.8rem' }}>
          <ListItemIcon sx={{ minWidth: 28 }}>
            {shuffleLoading
              ? <CircularProgress size={14} sx={{ color: 'hsl(var(--primary))' }} />
              : <CheckCircleIcon size={16} style={{ color: 'hsl(var(--primary))' }} />}
          </ListItemIcon>
          <ListItemText
            primary="Lookup in Shuffle"
            secondary={`Check ioc_${type} for previous sightings`}
            primaryTypographyProps={{ fontSize: '0.8rem' }}
            secondaryTypographyProps={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}
          />
        </MenuItem>
        <Divider sx={{ my: 0.5, borderColor: 'hsl(var(--border-subtle))' }} />
        {vtUrl ? (
          <MenuItem
            component="a"
            href={vtUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setAnchorEl(null)}
            sx={{ fontSize: '0.8rem' }}
          >
            <ListItemIcon sx={{ minWidth: 28 }}>
              <OpenInNewIcon size={16} style={{ color: 'hsl(var(--muted-foreground))' }} />
            </ListItemIcon>
            <ListItemText
              primary="Lookup on VirusTotal"
              secondary="Opens virustotal.com in a new tab"
              primaryTypographyProps={{ fontSize: '0.8rem' }}
              secondaryTypographyProps={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}
            />
          </MenuItem>
        ) : (
          <MenuItem disabled sx={{ fontSize: '0.8rem' }}>
            <ListItemIcon sx={{ minWidth: 28 }}>
              <HelpOutlineIcon size={16} />
            </ListItemIcon>
            <ListItemText
              primary="VirusTotal not supported"
              secondary={`No VT browse view for "${type}"`}
              primaryTypographyProps={{ fontSize: '0.8rem' }}
              secondaryTypographyProps={{ fontSize: '0.65rem', color: 'hsl(var(--muted-foreground))' }}
            />
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export default ObservableLookupMenu;
