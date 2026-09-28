import { Search as SearchIcon, Bell as NotificationsIcon, Settings as SettingsIcon, User as PersonIcon, LogOut as LogoutIcon, HelpCircle as HelpOutlineIcon } from 'lucide-react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Badge,
  Box,
  InputBase,
  Avatar,
  Menu,
  MenuItem,
  Divider,
  ListItemIcon,
} from '@mui/material';
import { useState } from 'react';
import { Link } from '@/lib/router-compat';
import { useEntityText } from '@/hooks/useEntityLabel';

interface AppHeaderProps {
  title?: string;
}

export const AppHeader = ({ title = 'Dashboard' }: AppHeaderProps) => {
  const t = useEntityText();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenu = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        backgroundColor: 'hsl(var(--background) / 0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid hsl(var(--border))',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'hsl(var(--muted) / 0.5)',
              borderRadius: 2,
              px: 2,
              py: 0.5,
              mr: 2,
            }}
          >
            <SearchIcon style={{ color: 'hsl(var(--muted-foreground))', marginRight: '8px' }} />
            <InputBase
              placeholder={t('Search incidents...')}
              sx={{
                color: 'inherit',
                width: { xs: 150, sm: 250 },
                '& ::placeholder': { color: 'text.secondary' },
              }}
            />
          </Box>

          <IconButton sx={{ color: 'text.secondary' }}>
            <HelpOutlineIcon />
          </IconButton>

          <IconButton sx={{ color: 'text.secondary' }}>
            <Badge badgeContent={3} color="error">
              <NotificationsIcon />
            </Badge>
          </IconButton>

          <IconButton onClick={handleMenu}>
            <Avatar
              sx={{
                width: 36,
                height: 36,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                fontSize: '0.875rem',
              }}
            >
              JD
            </Avatar>
          </IconButton>

          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleClose}
            onClick={handleClose}
            transformOrigin={{ horizontal: 'right', vertical: 'top' }}
            anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            PaperProps={{
              sx: {
                mt: 1,
                minWidth: 200,
                backgroundImage: 'none',
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
              },
            }}
          >
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                John Doe
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                john.doe@company.com
              </Typography>
            </Box>
            <Divider sx={{ borderColor: 'hsl(var(--border))' }} />
            <MenuItem component={Link} to="/settings">
              <ListItemIcon>
                <PersonIcon size={20} />
              </ListItemIcon>
              Profile
            </MenuItem>
            <MenuItem component={Link} to="/settings">
              <ListItemIcon>
                <SettingsIcon size={20} />
              </ListItemIcon>
              Settings
            </MenuItem>
            <Divider sx={{ borderColor: 'hsl(var(--border))' }} />
            <MenuItem component={Link} to="/">
              <ListItemIcon>
                <LogoutIcon size={20} />
              </ListItemIcon>
              Sign Out
            </MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
