/**
 * Assignment Schedule Configuration Component
 * Manages user availability schedules for auto-assignment with escalation levels
 */

import { Plus as AddIcon, Pencil as EditIcon, Trash2 as DeleteIcon, Clock as ScheduleIcon } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  CircularProgress,
  Alert,
  Stack,
  Tooltip,
} from '@mui/material';
import { useUsers, User } from '@/hooks/useUsers';
import { setDatastoreItem, getDatastoreItem, DATASTORE_CATEGORIES } from '@/Shuffle-Core/datastore';

// Escalation levels for assignment priority
export type EscalationLevel = 'tier1' | 'tier2' | 'tier3' | 'manager';

export const ESCALATION_LABELS: Record<EscalationLevel, string> = {
  tier1: 'Tier 1 - First Response',
  tier2: 'Tier 2 - Specialist',
  tier3: 'Tier 3 - Expert',
  manager: 'Manager - Escalation',
};

export const ESCALATION_COLORS: Record<EscalationLevel, string> = {
  tier1: '#4caf50',
  tier2: '#2196f3',
  tier3: '#ff9800',
  manager: '#f44336',
};

// Schedule entry for a user
export interface UserSchedule {
  userId: string;
  userName: string;
  userEmail: string;
  escalationLevel: EscalationLevel;
  schedules: ScheduleEntry[];
  enabled: boolean;
}

export interface ScheduleEntry {
  id: string;
  startDate: string; // ISO date string
  endDate: string; // ISO date string
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  timezone: string;
  daysOfWeek: number[]; // 0-6, Sunday-Saturday
}

interface AssignmentConfig {
  userSchedules: UserSchedule[];
  updatedAt: string;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const generateId = () => Math.random().toString(36).substring(2, 12);

export const AssignmentScheduleConfig = () => {
  const { users, loading: usersLoading } = useUsers();
  const [config, setConfig] = useState<AssignmentConfig>({ userSchedules: [], updatedAt: '' });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<UserSchedule | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ScheduleEntry | null>(null);
  const [currentUserScheduleIndex, setCurrentUserScheduleIndex] = useState<number>(-1);

  // Form state
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<EscalationLevel>('tier1');
  
  // Schedule entry form
  const [entryStartDate, setEntryStartDate] = useState('');
  const [entryEndDate, setEntryEndDate] = useState('');
  const [entryStartTime, setEntryStartTime] = useState('09:00');
  const [entryEndTime, setEntryEndTime] = useState('17:00');
  const [entryDays, setEntryDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri default

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getDatastoreItem('assignment_schedules', DATASTORE_CATEGORIES.CONFIGURATION);
      if (response.success && response.item?.value) {
        const data = typeof response.item.value === 'string' 
          ? JSON.parse(response.item.value) 
          : response.item.value;
        setConfig(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const saveConfig = async (newConfig: AssignmentConfig) => {
    setIsSaving(true);
    setError(null);
    try {
      const configToSave = {
        ...newConfig,
        updatedAt: new Date().toISOString(),
      };
      const response = await setDatastoreItem('assignment_schedules', configToSave, DATASTORE_CATEGORIES.CONFIGURATION);
      if (response.success) {
        setConfig(configToSave);
        setSuccessMessage('Configuration saved successfully');
        setTimeout(() => setSuccessMessage(null), 3000);
      } else {
        throw new Error(response.error || 'Failed to save configuration');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddUser = () => {
    setEditingSchedule(null);
    setSelectedUserId('');
    setSelectedLevel('tier1');
    setDialogOpen(true);
  };

  const handleEditUser = (schedule: UserSchedule) => {
    setEditingSchedule(schedule);
    setSelectedUserId(schedule.userId);
    setSelectedLevel(schedule.escalationLevel);
    setDialogOpen(true);
  };

  const handleSaveUser = () => {
    const selectedUser = users.find(u => u.id === selectedUserId);
    if (!selectedUser) return;

    const newSchedule: UserSchedule = {
      userId: selectedUser.id,
      userName: selectedUser.username,
      userEmail: selectedUser.username, // API returns username as email
      escalationLevel: selectedLevel,
      schedules: editingSchedule?.schedules || [],
      enabled: true,
    };

    let newUserSchedules: UserSchedule[];
    if (editingSchedule) {
      newUserSchedules = config.userSchedules.map(s => 
        s.userId === editingSchedule.userId ? newSchedule : s
      );
    } else {
      // Check if user already exists
      if (config.userSchedules.some(s => s.userId === selectedUserId)) {
        setError('User already has a schedule configured');
        return;
      }
      newUserSchedules = [...config.userSchedules, newSchedule];
    }

    saveConfig({ ...config, userSchedules: newUserSchedules });
    setDialogOpen(false);
  };

  const handleDeleteUser = (userId: string) => {
    const newUserSchedules = config.userSchedules.filter(s => s.userId !== userId);
    saveConfig({ ...config, userSchedules: newUserSchedules });
  };

  const handleToggleEnabled = (userId: string) => {
    const newUserSchedules = config.userSchedules.map(s =>
      s.userId === userId ? { ...s, enabled: !s.enabled } : s
    );
    saveConfig({ ...config, userSchedules: newUserSchedules });
  };

  // Schedule entry handlers
  const handleAddScheduleEntry = (scheduleIndex: number) => {
    setCurrentUserScheduleIndex(scheduleIndex);
    setEditingEntry(null);
    setEntryStartDate(new Date().toISOString().split('T')[0]);
    setEntryEndDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    setEntryStartTime('09:00');
    setEntryEndTime('17:00');
    setEntryDays([1, 2, 3, 4, 5]);
    setScheduleDialogOpen(true);
  };

  const handleEditScheduleEntry = (scheduleIndex: number, entry: ScheduleEntry) => {
    setCurrentUserScheduleIndex(scheduleIndex);
    setEditingEntry(entry);
    setEntryStartDate(entry.startDate);
    setEntryEndDate(entry.endDate);
    setEntryStartTime(entry.startTime);
    setEntryEndTime(entry.endTime);
    setEntryDays(entry.daysOfWeek);
    setScheduleDialogOpen(true);
  };

  const handleSaveScheduleEntry = () => {
    const newEntry: ScheduleEntry = {
      id: editingEntry?.id || generateId(),
      startDate: entryStartDate,
      endDate: entryEndDate,
      startTime: entryStartTime,
      endTime: entryEndTime,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      daysOfWeek: entryDays,
    };

    const newUserSchedules = config.userSchedules.map((s, idx) => {
      if (idx !== currentUserScheduleIndex) return s;
      
      let newSchedules: ScheduleEntry[];
      if (editingEntry) {
        newSchedules = s.schedules.map(e => e.id === editingEntry.id ? newEntry : e);
      } else {
        newSchedules = [...s.schedules, newEntry];
      }
      return { ...s, schedules: newSchedules };
    });

    saveConfig({ ...config, userSchedules: newUserSchedules });
    setScheduleDialogOpen(false);
  };

  const handleDeleteScheduleEntry = (scheduleIndex: number, entryId: string) => {
    const newUserSchedules = config.userSchedules.map((s, idx) => {
      if (idx !== scheduleIndex) return s;
      return { ...s, schedules: s.schedules.filter(e => e.id !== entryId) };
    });
    saveConfig({ ...config, userSchedules: newUserSchedules });
  };

  const toggleDay = (day: number) => {
    setEntryDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  // Get users not yet scheduled
  const availableUsers = users.filter(u => 
    !config.userSchedules.some(s => s.userId === u.id) || 
    editingSchedule?.userId === u.id
  );

  if (isLoading || usersLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScheduleIcon /> Auto-Assignment Schedules
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Configure user availability and escalation levels for automatic alert assignment
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddUser}
          disabled={availableUsers.length === 0}
        >
          Add User Schedule
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {successMessage && <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>}

      {config.userSchedules.length === 0 ? (
        <Card>
          <CardContent>
            <Typography color="text.secondary" textAlign="center" py={4}>
              No assignment schedules configured. Add users to enable auto-assignment.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {config.userSchedules.map((userSchedule, scheduleIndex) => (
            <Card key={userSchedule.userId} sx={{ opacity: userSchedule.enabled ? 1 : 0.6 }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                  <Box>
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                      <Typography variant="subtitle1" fontWeight="bold">
                        {userSchedule.userName}
                      </Typography>
                      <Chip
                        label={ESCALATION_LABELS[userSchedule.escalationLevel]}
                        size="small"
                        sx={{ 
                          bgcolor: ESCALATION_COLORS[userSchedule.escalationLevel],
                          color: 'white',
                        }}
                      />
                      {!userSchedule.enabled && (
                        <Chip label="Disabled" size="small" color="default" />
                      )}
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {userSchedule.userEmail}
                    </Typography>
                  </Box>
                  <Box>
                    <Tooltip title={userSchedule.enabled ? 'Disable' : 'Enable'}>
                      <Button
                        size="small"
                        onClick={() => handleToggleEnabled(userSchedule.userId)}
                        sx={{ mr: 1 }}
                      >
                        {userSchedule.enabled ? 'Disable' : 'Enable'}
                      </Button>
                    </Tooltip>
                    <IconButton size="small" onClick={() => handleEditUser(userSchedule)}>
                      <EditIcon size={20} />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDeleteUser(userSchedule.userId)} color="error">
                      <DeleteIcon size={20} />
                    </IconButton>
                  </Box>
                </Box>

                {/* Schedule entries */}
                <Box>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="body2" fontWeight="medium">
                      Availability Windows
                    </Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={() => handleAddScheduleEntry(scheduleIndex)}>
                      Add Window
                    </Button>
                  </Box>

                  {userSchedule.schedules.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" fontStyle="italic">
                      No availability windows configured - user will not be auto-assigned
                    </Typography>
                  ) : (
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>Date Range</TableCell>
                            <TableCell>Hours</TableCell>
                            <TableCell>Days</TableCell>
                            <TableCell width={80}>Actions</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {userSchedule.schedules.map((entry) => (
                            <TableRow key={entry.id}>
                              <TableCell>
                                {new Date(entry.startDate).toLocaleDateString()} - {new Date(entry.endDate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>
                                {entry.startTime} - {entry.endTime}
                              </TableCell>
                              <TableCell>
                                {entry.daysOfWeek.map(d => DAYS_OF_WEEK[d]).join(', ')}
                              </TableCell>
                              <TableCell>
                                <IconButton size="small" onClick={() => handleEditScheduleEntry(scheduleIndex, entry)}>
                                  <EditIcon size={20} />
                                </IconButton>
                                <IconButton size="small" color="error" onClick={() => handleDeleteScheduleEntry(scheduleIndex, entry.id)}>
                                  <DeleteIcon size={20} />
                                </IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}

      {/* Add/Edit User Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingSchedule ? 'Edit User Schedule' : 'Add User Schedule'}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>User</InputLabel>
              <Select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                label="User"
                disabled={!!editingSchedule}
              >
                {availableUsers.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.username}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Escalation Level</InputLabel>
              <Select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value as EscalationLevel)}
                label="Escalation Level"
              >
                {Object.entries(ESCALATION_LABELS).map(([key, label]) => (
                  <MenuItem key={key} value={key}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Box 
                        sx={{ 
                          width: 12, 
                          height: 12, 
                          borderRadius: '50%', 
                          bgcolor: ESCALATION_COLORS[key as EscalationLevel] 
                        }} 
                      />
                      {label}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveUser} variant="contained" disabled={!selectedUserId || isSaving}>
            {isSaving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Schedule Entry Dialog */}
      <Dialog open={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingEntry ? 'Edit Availability Window' : 'Add Availability Window'}</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 1 }}>
            <Box display="flex" gap={2}>
              <TextField
                label="Start Date"
                type="date"
                value={entryStartDate}
                onChange={(e) => setEntryStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="End Date"
                type="date"
                value={entryEndDate}
                onChange={(e) => setEntryEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Box>

            <Box display="flex" gap={2}>
              <TextField
                label="Start Time"
                type="time"
                value={entryStartTime}
                onChange={(e) => setEntryStartTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="End Time"
                type="time"
                value={entryEndTime}
                onChange={(e) => setEntryEndTime(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Box>

            <Box>
              <Typography variant="body2" mb={1}>Days of Week</Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {DAYS_OF_WEEK.map((day, index) => (
                  <Chip
                    key={day}
                    label={day}
                    onClick={() => toggleDay(index)}
                    color={entryDays.includes(index) ? 'primary' : 'default'}
                    variant={entryDays.includes(index) ? 'filled' : 'outlined'}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleSaveScheduleEntry} 
            variant="contained" 
            disabled={!entryStartDate || !entryEndDate || entryDays.length === 0 || isSaving}
          >
            {isSaving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
