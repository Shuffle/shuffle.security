import { createFileRoute } from '@tanstack/react-router';
import { TextField, Select, MenuItem } from '@mui/material';
export const Route = createFileRoute('/tmp-inputh')({ component: () => (
  <div style={{ padding: 40, display: 'flex', gap: 8 }}>
    <Select size="small" value="a" data-testid="sel"><MenuItem value="a">title</MenuItem></Select>
    <TextField size="small" value="x" inputProps={{ 'data-testid': 'tf' }} />
  </div>) });
