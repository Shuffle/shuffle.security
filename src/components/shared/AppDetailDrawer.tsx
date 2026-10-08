import { AppDetailDrawer } from '@/Shuffle-Core';
import { useAppDetail } from '@/Shuffle-Core/AppDetailContext';
import { useTheme } from '@/context/ThemeContext';

export const GlobalAppDetailDrawer = () => {
  const { currentAppName, isOpen, closeApp } = useAppDetail();
  const { resolvedTheme } = useTheme();
  return (
    <AppDetailDrawer
      open={isOpen}
      onClose={closeApp}
      appName={currentAppName}
      theme={resolvedTheme}
    />
  );
};

export default AppDetailDrawer;
