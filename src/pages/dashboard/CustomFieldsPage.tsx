import { Plus as AddIcon, Trash2 as DeleteIcon, Pencil as EditIcon } from 'lucide-react';
import { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import { motion } from 'framer-motion';
import { useDatastore } from '@/hooks/useDatastore';

import { DATASTORE_CATEGORIES } from '@/Shuffle-MCPs/datastore';
import { usePageMeta } from '@/hooks/usePageMeta';

const CATEGORY = DATASTORE_CATEGORIES.CUSTOM_FIELDS;

type FieldType = 'text' | 'number' | 'select' | 'date' | 'boolean';

interface CustomField {
  name: string;
  key: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // For select type
  description?: string;
}

const fieldTypes: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select / Dropdown' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Yes / No' },
];

const CustomFieldsPage = () => {

  usePageMeta({
    title: 'Custom fields',
    description: 'Define custom fields for incidents and cases.',
    url: '/incidents/custom-fields',
  });
  const { items, isLoading, error, fetchItems, addItem, removeItem } = useDatastore({ category: CATEGORY });
  const [fields, setFields] = useState<CustomField[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState<CustomField>({ name: '', key: '', type: 'text', required: false, description: '' });
  const [optionsInput, setOptionsInput] = useState('');

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    const parsed: CustomField[] = items
      .filter(item => !item.category || item.category === CATEGORY)
      .map(item => {
        try {
          const val = JSON.parse(item.value);
          if (val && typeof val === 'object') {
            return {
              name: typeof val.name === 'string' && val.name ? val.name : item.key,
              key: typeof val.key === 'string' && val.key ? val.key : item.key,
              type: (['text', 'number', 'select', 'date', 'boolean'].includes(val.type) ? val.type : 'text') as FieldType,
              required: Boolean(val.required),
              options: Array.isArray(val.options) ? val.options : undefined,
              description: typeof val.description === 'string' ? val.description : '',
            };
          }
          return { name: item.key, key: item.key, type: 'text' as FieldType, required: false };
        } catch {
          return { name: item.key, key: item.key, type: 'text' as FieldType, required: false };
        }
      });
    setFields(parsed);
  }, [items]);

  const handleOpenDialog = (field?: CustomField) => {
    if (field) {
      setEditingField(field);
      setFormData(field);
      setOptionsInput(field.options?.join(', ') || '');
    } else {
      setEditingField(null);
      setFormData({ name: '', key: '', type: 'text', required: false, description: '' });
      setOptionsInput('');
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.key) return;
    
    const fieldToSave: CustomField = {
      ...formData,
      description: formData.description || '',
      options: formData.type === 'select' && optionsInput 
        ? optionsInput.split(',').map(o => o.trim()).filter(Boolean)
        : [],
    };
    
    if (editingField && editingField.key !== formData.key) {
      await removeItem(editingField.key);
    }
    await addItem(formData.key, fieldToSave);
    setDialogOpen(false);
    setFormData({ name: '', key: '', type: 'text', required: false, description: '' });
    setOptionsInput('');
    // Small delay to allow backend propagation before re-fetching
    setTimeout(() => fetchItems(), 500);
  };

  const handleDelete = async (key: string) => {
    await removeItem(key);
    // Small delay to allow backend propagation before re-fetching
    setTimeout(() => fetchItems(), 500);
  };

  const generateKey = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} style={{ maxWidth: 1400, width: '100%', margin: '0 auto' }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 600 }}>Custom Fields</Typography>
          {isLoading && <CircularProgress size={20} />}
        </Box>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={{ height: 36 }}>
          Add Custom Field
        </Button>
      </Box>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>
      )}

      <Card elevation={0} sx={{ bgcolor: 'transparent', backgroundImage: 'none', border: '1px solid hsl(var(--border))' }}>
        <CardContent sx={{ p: 0 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Key</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Required</TableCell>
                  <TableCell>Description</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.key} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>{field.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>
                        {field.key}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={fieldTypes.find(t => t.value === field.type)?.label || field.type} 
                        size="small" 
                        sx={{ textTransform: 'capitalize' }} 
                      />
                      {field.type === 'select' && field.options && (
                        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mt: 0.5 }}>
                          Options: {field.options.join(', ')}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={field.required ? 'Yes' : 'No'} 
                        size="small" 
                        color={field.required ? 'primary' : 'default'}
                        sx={{ fontSize: '0.7rem' }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {field.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleOpenDialog(field)}>
                        <EditIcon size={20} />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(field.key)} color="error">
                        <DeleteIcon size={20} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {fields.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary">No custom fields configured. Click "Add Custom Field" to create one.</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingField ? 'Edit Custom Field' : 'Add Custom Field'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Display Name"
              value={formData.name}
              onChange={(e) => {
                const name = e.target.value;
                setFormData({ 
                  ...formData, 
                  name,
                  key: editingField ? formData.key : generateKey(name),
                });
              }}
              fullWidth
              placeholder="e.g., Customer ID"
            />
            <TextField
              label="Field Key"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              fullWidth
              placeholder="e.g., customer_id"
              disabled={!!editingField}
              helperText="Used as the internal identifier. Cannot be changed after creation."
              sx={{ '& input': { fontFamily: 'monospace' } }}
            />
            <FormControl fullWidth>
              <InputLabel>Field Type</InputLabel>
              <Select
                value={formData.type}
                label="Field Type"
                onChange={(e) => setFormData({ ...formData, type: e.target.value as FieldType })}
              >
                {fieldTypes.map((type) => (
                  <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {formData.type === 'select' && (
              <TextField
                label="Options (comma-separated)"
                value={optionsInput}
                onChange={(e) => setOptionsInput(e.target.value)}
                fullWidth
                placeholder="e.g., Low, Medium, High"
                helperText="Enter dropdown options separated by commas"
              />
            )}
            <FormControl fullWidth>
              <InputLabel>Required</InputLabel>
              <Select
                value={formData.required ? 'yes' : 'no'}
                label="Required"
                onChange={(e) => setFormData({ ...formData, required: e.target.value === 'yes' })}
              >
                <MenuItem value="no">No</MenuItem>
                <MenuItem value="yes">Yes</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              fullWidth
              placeholder="Optional description or help text"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" disabled={!formData.name || !formData.key}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </motion.div>
  );
};

export default CustomFieldsPage;
