import { createTheme } from '@mui/material/styles';

const getCommon = () => ({
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: { fontWeight: 700, letterSpacing: '-0.02em' },
    h2: { fontWeight: 700, letterSpacing: '-0.01em' },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600, textTransform: 'none' as const },
  },
  shape: { borderRadius: 8 },
});

const getComponents = (_mode: 'light' | 'dark', primaryColor: string = '#FF6600') => {
  const border = 'hsl(var(--border))';
  const cardBg = 'var(--gradient-card)';
  const drawerBg = 'hsl(var(--sidebar-background))';
  const tooltipBg = 'hsl(var(--popover))';
  const tooltipColor = 'hsl(var(--popover-foreground))';
  const tableHeadBg = 'hsl(var(--muted) / 0.5)';
  const appBarBg = 'hsl(var(--background) / 0.9)';

  return {
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 8, padding: '10px 24px', fontWeight: 600 },
        // Longhand `backgroundColor` (not the `background` shorthand) so a
        // per-component `sx={{ bgcolor: ... }}` reliably wins — otherwise a
        // destructive button can end up orange with red text.
        containedPrimary: {
          backgroundColor: primaryColor,
          color: '#FFFFFF',
          boxShadow: `0 4px 14px ${primaryColor}40`,
          '&:hover': {
            backgroundColor: primaryColor,
            opacity: 0.9,
            boxShadow: `0 6px 20px ${primaryColor}60`,
          },
        },
        containedError: {
          backgroundColor: 'hsl(var(--destructive))',
          color: 'hsl(var(--destructive-foreground))',
          boxShadow: 'none',
          '&:hover': { backgroundColor: 'hsl(var(--destructive) / 0.9)', boxShadow: 'none' },
        },
        // Scope the orange treatment to primary only. A generic `outlined`
        // override painted error/destructive buttons orange on red borders.
        outlinedPrimary: {
          borderColor: `${primaryColor}80`,
          color: primaryColor,
          '&:hover': {
            borderColor: primaryColor,
            backgroundColor: `${primaryColor}14`,
          },
        },
        outlinedError: {
          borderColor: 'hsl(var(--destructive) / 0.5)',
          color: 'hsl(var(--destructive))',
          '&:hover': {
            borderColor: 'hsl(var(--destructive))',
            backgroundColor: 'hsl(var(--destructive) / 0.08)',
          },
        },
        textError: {
          color: 'hsl(var(--destructive))',
          '&:hover': { backgroundColor: 'hsl(var(--destructive) / 0.08)' },
        },
      },
    },

    MuiCard: {
      styleOverrides: {
        root: { backgroundImage: cardBg, borderRadius: 12, border: `1px solid ${border}` },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: appBarBg,
          color: 'hsl(var(--foreground))',
          backdropFilter: 'blur(12px)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: drawerBg,
          borderRight: '1px solid hsl(var(--sidebar-border))',
          maxWidth: '100vw',
          boxSizing: 'border-box' as const,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        root: { zIndex: 10010 },
        paper: {
          backgroundImage: cardBg,
          border: `1px solid ${border}`,
          margin: 16,
          boxSizing: 'border-box' as const,
          '@media (max-width: 600px)': {
            maxWidth: 'calc(100vw - 32px)',
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        root: { zIndex: 10040 },
        paper: {
          backgroundImage: cardBg,
          border: `1px solid ${border}`,
          maxWidth: 'calc(100vw - 24px)',
          boxSizing: 'border-box' as const,
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        root: { zIndex: 10040 },
        paper: {
          backgroundImage: cardBg,
          border: `1px solid ${border}`,
          maxWidth: 'calc(100vw - 24px)',
          boxSizing: 'border-box' as const,
        },
      },
    },
    MuiAutocomplete: {
      defaultProps: { slotProps: { popper: { sx: { zIndex: 10040 } } } },
    },
    MuiPopper: {
      styleOverrides: {
        root: { zIndex: 10040 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${border}` },
        head: { fontWeight: 600, backgroundColor: tableHeadBg },
      },
    },
    MuiTooltip: {
      defaultProps: {
        // Tooltips render via a Popper portal at MUI's default tooltip
        // z-index (1500). Drawers / Dialogs in this app frequently sit
        // above that (surface layer starts at 10030), which left tooltips
        // rendering UNDER the panel that owns the trigger. Setting the
        // baseline popper z-index to 10050 fixes tooltips globally.
        slotProps: {
          popper: { sx: { zIndex: 10050 } },
        },
      },
      styleOverrides: {
        tooltip: {
          backgroundColor: tooltipBg,
          color: tooltipColor,
          border: '1px solid hsl(var(--border))',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
          borderRadius: 8,
          fontSize: '0.75rem',
          maxWidth: 280,
        },
        arrow: {
          color: tooltipBg,
          '&::before': {
            border: '1px solid hsl(var(--border))',
            boxSizing: 'border-box',
          },
        },
      },
    },
  };
};

export const createMuiTheme = (mode: 'light' | 'dark', brandColor?: string | null) => {
  const primaryColor = brandColor || '#FF6600';
  
  return createTheme({
    ...getCommon(),
    palette: {
      mode,
      primary: { 
        main: primaryColor, 
        light: primaryColor, 
        dark: primaryColor, 
        contrastText: '#FFFFFF' 
      },
      secondary: { main: 'hsl(var(--secondary))', light: 'hsl(var(--muted))', dark: 'hsl(var(--secondary))', contrastText: 'hsl(var(--secondary-foreground))' },
      error: { main: 'hsl(var(--destructive))', light: 'hsl(var(--destructive))', dark: 'hsl(var(--destructive))', contrastText: 'hsl(var(--destructive-foreground))' },
      warning: { main: 'hsl(var(--severity-medium))', light: 'hsl(var(--severity-medium))', dark: 'hsl(var(--severity-medium))', contrastText: 'hsl(var(--foreground))' },
      success: { main: 'hsl(var(--severity-low))', light: 'hsl(var(--severity-low))', dark: 'hsl(var(--severity-low))', contrastText: 'hsl(var(--foreground))' },
      info: { main: 'hsl(var(--severity-info))', light: 'hsl(var(--severity-info))', dark: 'hsl(var(--severity-info))', contrastText: 'hsl(var(--foreground))' },
      background: {
        default: 'hsl(var(--background))',
        paper: 'hsl(var(--card))',
      },
      text: {
        primary: 'hsl(var(--foreground))',
        secondary: 'hsl(var(--muted-foreground))',
        disabled: 'hsl(var(--muted-foreground))',
      },
      divider: 'hsl(var(--border))',
    },
    components: getComponents(mode, primaryColor),
  });
};

// Default export for backward compat
export const muiTheme = createMuiTheme('dark', '#FF6600');
