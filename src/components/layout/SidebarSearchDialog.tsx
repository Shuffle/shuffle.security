/**
 * SidebarSearchDialog — Ctrl+K powered command palette search popup.
 *
 * Uses the standardized SearchDialog from Shuffle-Core across both
 * Shuffle Security and Shuffle Automation (Shaffuru).
 */

import { SearchDialog } from '@/Shuffle-Core';
import { useNavigate } from '@/lib/router-compat';
import { useTheme } from '@/context/ThemeContext';

export interface SidebarSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SidebarSearchDialog = ({ open, onOpenChange }: SidebarSearchDialogProps) => {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  return (
    <SearchDialog
      open={open}
      onOpenChange={onOpenChange}
      hostPlatform="security"
      onNavigate={(path: string) => navigate(path)}
      enableCorrelations={true}
      theme={resolvedTheme}
    />
  );
};

export default SidebarSearchDialog;