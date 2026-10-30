import { createFileRoute } from '@tanstack/react-router';
import { TextField, MenuItem } from '@mui/material';
export const Route = createFileRoute('/tmp-inputh')({ component: () => (
  <div style={{ padding: 40, display: 'flex', gap: 8 }}>
    <TextField select size="small" value="a"><MenuItem value="a">title</MenuItem></TextField>
    <TextField size="small" value="x" />
  </div>) });
