import {
  Box,
  Typography,
} from '@mui/material';
import { motion } from 'framer-motion';
import PermissionsPanel from '@/components/agent/PermissionsPanel';
import { usePageMeta } from '@/hooks/usePageMeta';

const ResponseActionsPage = () => {

  usePageMeta({
    title: 'Response actions',
    description: 'Manage automated response actions and host monitor permissions.',
    url: '/monitors/response',
  });
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <Box sx={{ p: { xs: 2, sm: 4 }, maxWidth: 900, width: '100%', mx: 'auto' }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h5" sx={{ fontWeight: 600, color: 'hsl(var(--foreground))', mb: 0.5 }}>
            Response Actions
          </Typography>
          <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            Control what automated response actions are allowed across AI Agents.
          </Typography>
        </Box>

        <PermissionsPanel />
      </Box>
    </motion.div>
  );
};

export default ResponseActionsPage;
