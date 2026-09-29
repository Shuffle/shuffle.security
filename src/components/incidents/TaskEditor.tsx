import { CheckCircle2 as CheckCircleIcon, Trash2 as DeleteIcon, ChevronDown as ExpandMoreIcon, ChevronUp as ExpandLessIcon } from 'lucide-react';
import { useState } from 'react';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';
import {
  Box,
  Typography,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Collapse,
  LinearProgress,
} from '@mui/material';
import { useUsers } from '@/hooks/useUsers';
import { MentionInput } from './MentionInput';
import { TaskDateTimePicker } from './TaskDateTimePicker';
import { FileAttachments } from './FileAttachments';
import { taskCategories, IncidentTask, FileAttachment } from './CreateIncidentDialog';
import { isAIAssignee } from '@/lib/utils';
import {
  Select as ShadcnSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface TaskEditorProps {
  tasks: IncidentTask[];
  onTasksChange: (tasks: IncidentTask[]) => void;
  incidentId?: string;
  compact?: boolean;
}

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: 'hsl(var(--input))',
    '& fieldset': { borderColor: 'hsl(var(--border))' },
    '&:hover fieldset': { borderColor: 'hsl(var(--muted-foreground) / 0.4)' },
    '&.Mui-focused fieldset': { borderColor: '#FF6600' },
  },
};

export const TaskEditor = ({ 
  tasks, 
  onTasksChange, 
  incidentId = 'new',
  compact = false,
}: TaskEditorProps) => {
  const TASKS_PER_PAGE = 25;
  const { users, loading: usersLoading } = useUsers();
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(TASKS_PER_PAGE);

  const handleToggleTask = (taskId: string) => {
    onTasksChange(tasks.map(task => 
      task.id === taskId 
        ? { 
            ...task, 
            completed: !task.completed, 
            completedAt: !task.completed ? Date.now() : 0 
          } 
        : task
    ));
  };

  const handleUpdateTaskTitle = (taskId: string, title: string) => {
    onTasksChange(tasks.map(task => 
      task.id === taskId ? { ...task, title } : task
    ));
  };

  const handleUpdateTaskAssignee = (taskId: string, assignee: string) => {
    onTasksChange(tasks.map(task => 
      task.id === taskId ? { ...task, assignee } : task
    ));
  };

  const handleUpdateTaskDueDate = (taskId: string, dueDate: string) => {
    onTasksChange(tasks.map(task => 
      task.id === taskId ? { ...task, dueDate } : task
    ));
  };

  const handleUpdateTaskDescription = (taskId: string, description: string) => {
    onTasksChange(tasks.map(task => 
      task.id === taskId ? { ...task, description } : task
    ));
  };

  const handleUpdateTaskCategory = (taskId: string, category: string) => {
    onTasksChange(tasks.map(task => 
      task.id === taskId ? { ...task, category } : task
    ));
  };

  const handleUpdateTaskAttachments = (taskId: string, attachments: FileAttachment[]) => {
    onTasksChange(tasks.map(task => 
      task.id === taskId ? { ...task, attachments } : task
    ));
  };

  const handleUpdateTaskDependency = (taskId: string, dependsOn: string) => {
    onTasksChange(tasks.map(task => 
      task.id === taskId ? { ...task, dependsOn: dependsOn || '' } : task
    ));
  };

  const handleDeleteTask = (taskId: string) => {
    // Soft delete: mark as disabled instead of removing
    onTasksChange(tasks.map(task => 
      task.id === taskId ? { ...task, disabled: true } : task
    ));
  };


  const isTaskBlocked = (task: IncidentTask): boolean => {
    if (!task.dependsOn) return false;
    const dependencyTask = tasks.find(t => t.title === task.dependsOn);
    return dependencyTask ? !dependencyTask.completed : false;
  };

  const getTaskProgress = () => {
    if (tasks.length === 0) return 0;
    const completedCount = tasks.filter(t => t.completed).length;
    return Math.round((completedCount / tasks.length) * 100);
  };

  if (tasks.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary', fontStyle: 'italic', textAlign: 'center', py: 2 }}>
        No tasks yet.
      </Typography>
    );
  }

  return (
    <Box>
      {/* Progress bar */}
      {!compact && tasks.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              Progress
            </Typography>
            <Typography variant="caption" sx={{ color: getTaskProgress() === 100 ? '#22c55e' : 'text.secondary' }}>
              {getTaskProgress()}%
            </Typography>
          </Box>
          <LinearProgress 
            variant="determinate" 
            value={getTaskProgress()} 
            sx={{ 
              height: 4, 
              borderRadius: 2,
              bgcolor: 'hsl(var(--border))',
              '& .MuiLinearProgress-bar': {
                bgcolor: getTaskProgress() === 100 ? '#22c55e' : '#ff6600',
                borderRadius: 2,
              },
            }} 
          />
        </Box>
      )}

      {/* Task list - visually deduplicate by ID and hide disabled tasks */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(() => {
          const seenIds = new Set<string>();
          const filteredTasks = tasks
            .filter((task) => !task.disabled) // Hide disabled (soft-deleted) tasks
            .filter((task) => {
              if (seenIds.has(task.id)) return false;
              seenIds.add(task.id);
              return true;
            });
          const visibleTasks = filteredTasks.slice(0, visibleCount);
          const hasMore = filteredTasks.length > visibleCount;
          const remaining = filteredTasks.length - visibleCount;

          return (
            <>
              {visibleTasks.map((task) => {
          const isBlocked = isTaskBlocked(task);
          const dependencyTask = task.dependsOn ? tasks.find(t => t.title === task.dependsOn) : null;
          const isExpanded = expandedTaskId === task.id;
          const categoryInfo = taskCategories.find(c => c.value === task.category);
          
          return (
            <Box key={task.id}>
              {/* Task Card */}
              <Box 
                sx={{ 
                  p: compact ? 1.5 : 2,
                  borderRadius: isExpanded ? '12px 12px 0 0' : '12px',
                  bgcolor: isExpanded 
                    ? 'rgba(255, 102, 0, 0.08)' 
                    : task.completed 
                      ? 'rgba(34, 197, 94, 0.08)' 
                      : isBlocked 
                        ? 'rgba(255,255,255,0.02)' 
                        : 'hsl(var(--input))',
                  border: '2px solid',
                  borderColor: isExpanded 
                    ? 'rgba(255, 102, 0, 0.4)' 
                    : task.completed 
                      ? 'rgba(34, 197, 94, 0.2)' 
                      : isBlocked 
                        ? 'rgba(255,255,255,0.05)' 
                        : 'rgba(255,255,255,0.08)',
                  borderBottom: isExpanded ? 'none' : undefined,
                  opacity: isBlocked ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: isExpanded ? '0 4px 20px rgba(255, 102, 0, 0.15)' : 'none',
                }}
              >
                {/* Row 1: Checkbox + Title + Delete */}
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
                  {/* Expand toggle */}
                  {!compact && (
                    <IconButton 
                      size="small" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedTaskId(isExpanded ? null : task.id);
                      }}
                      sx={{ p: 0.5, color: 'text.secondary', mt: 0.25 }}
                    >
                      {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    </IconButton>
                  )}
                  
                  <IconButton 
                    size="small" 
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isBlocked) handleToggleTask(task.id);
                    }}
                    disabled={isBlocked}
                    sx={{ 
                      p: 0.5,
                      mt: 0.25,
                      color: task.completed ? '#22c55e' : 'text.secondary',
                    }}
                  >
                    {task.completed ? (
                      <CheckCircleIcon />
                    ) : (
                      <Box sx={{ 
                        width: 20, 
                        height: 20, 
                        borderRadius: '50%', 
                        border: '2px solid currentColor',
                      }} />
                    )}
                  </IconButton>
                  
                  {/* Title - full width */}
                  <Box sx={{ flex: 1 }}>
                    <MentionInput
                      value={task.title}
                      onChange={(value) => handleUpdateTaskTitle(task.id, value)}
                      size="small"
                      variant="standard"
                      placeholder="Task title..."
                      multiline
                      InputProps={{
                        disableUnderline: true,
                        sx: { 
                          fontSize: compact ? '0.95rem' : '1.1rem',
                          fontWeight: 500,
                          lineHeight: 1.5,
                          textDecoration: task.completed ? 'line-through' : 'none',
                          color: task.completed ? 'text.secondary' : 'text.primary',
                          '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                          borderRadius: 0.5,
                          px: 0.5,
                          py: 0.25,
                        },
                      }}
                      sx={{ width: '100%' }}
                    />
                    {isBlocked && dependencyTask && (
                      <Typography variant="caption" sx={{ color: 'warning.main', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, pl: 0.5 }}>
                        ⏳ Waiting on: {dependencyTask.title}
                      </Typography>
                    )}
                  </Box>
                  
                  <IconButton 
                    size="small" 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTask(task.id);
                    }}
                    sx={{ 
                      p: 0.5, 
                      mt: 0.25,
                      color: 'text.disabled',
                      '&:hover': { color: '#ef4444' },
                    }}
                  >
                    <DeleteIcon size={20} />
                  </IconButton>
                </Box>
                
                {/* Row 2: Metadata (Category, AI badge, Assignee, Due date) */}
                <Box sx={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1.5, 
                  mt: 1.5, 
                  ml: compact ? 4.5 : 7.5,
                  flexWrap: 'wrap',
                }}>
                  {/* Category dropdown */}
                  <ShadcnSelect
                    value={task.category || ''}
                    onValueChange={(value) => handleUpdateTaskCategory(task.id, value)}
                  >
                    <SelectTrigger 
                      className="h-7 w-auto min-w-[100px] border-0 px-2.5 text-xs font-medium"
                      style={{
                        backgroundColor: categoryInfo ? `${categoryInfo.color}20` : 'hsl(var(--border))',
                        color: categoryInfo?.color || 'hsl(var(--muted-foreground))',
                        borderRadius: '9999px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {taskCategories.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: cat.color }} 
                            />
                            {cat.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </ShadcnSelect>
                  
                  {/* AI Agent badge - only in compact mode (non-compact has the dropdown) */}
                  {compact && isAIAssignee(task.assignee) && (
                    <div 
                      className="h-7 px-2.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
                      style={{
                        backgroundColor: task.aiWorking ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
                        color: '#22c55e',
                        border: task.aiWorking ? '1px solid rgba(34, 197, 94, 0.4)' : 'none',
                        animation: task.aiWorking ? 'pulse 2s infinite' : 'none',
                      }}
                    >
                      <AgentIcon size={14} />
                      {task.aiWorking ? 'AI Working...' : 'AI Agent'}
                    </div>
                  )}
                  
                  {!compact && (
                    <>
                      <FormControl size="small" sx={{ minWidth: 100 }}>
                        <Select
                          value={task.assignee || ''}
                          onChange={(e) => handleUpdateTaskAssignee(task.id, e.target.value)}
                          variant="standard"
                          disableUnderline
                          displayEmpty
                          disabled={usersLoading}
                          sx={{ fontSize: '0.75rem' }}
                        >
                          <MenuItem value=""><em>Unassigned</em></MenuItem>
                          <MenuItem value="AI Agent" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box component="span" sx={{ 
                              width: 6, 
                              height: 6, 
                              borderRadius: '50%', 
                              bgcolor: '#22c55e',
                              display: 'inline-block',
                              mr: 0.5,
                            }} />
                            AI Agent
                          </MenuItem>
                          {users.map((user) => (
                            <MenuItem key={user.id} value={user.username}>{user.username}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      
                      <TaskDateTimePicker
                        value={task.dueDate ?? ''}
                        onChange={(date) => handleUpdateTaskDueDate(task.id, date)}
                      />
                    </>
                  )}
                </Box>
              </Box>
              
              {/* Expanded Task Details */}
              {!compact && (
                <Collapse in={isExpanded}>
                  <Box sx={{ 
                    p: 2, 
                    bgcolor: 'hsl(var(--muted) / 0.5)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderTop: 'none',
                    borderRadius: '0 0 8px 8px',
                  }}>
                    <Box sx={{ display: 'flex', gap: 2, mb: 1.5 }}>
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel sx={{ fontSize: '0.75rem' }}>Depends On</InputLabel>
                        <Select
                          value={task.dependsOn || ''}
                          label="Depends On"
                          onChange={(e) => handleUpdateTaskDependency(task.id, e.target.value)}
                          sx={{ fontSize: '0.8rem' }}
                        >
                          <MenuItem value=""><em>None</em></MenuItem>
                          {tasks.filter(t => t.id !== task.id).map((t) => (
                            <MenuItem key={t.id} value={t.title}>{t.title}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Box>
                    
                    <MentionInput
                      value={task.description || ''}
                      onChange={(value) => handleUpdateTaskDescription(task.id, value)}
                      multiline
                      rows={2}
                      fullWidth
                      size="small"
                      placeholder="Add notes or description..."
                      sx={inputSx}
                    />
                    
                    {/* File attachments */}
                    <Box sx={{ mt: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 0.5, display: 'block' }}>
                        Attachments
                      </Typography>
                      <FileAttachments
                        attachments={task.attachments || []}
                        onChange={(attachments) => handleUpdateTaskAttachments(task.id, attachments)}
                        namespace="incidents"
                        labels={[`task-${task.id}`, incidentId]}
                        compact
                      />
                    </Box>
                    
                    {/* Task metadata */}
                    <Box sx={{ display: 'flex', gap: 3, mt: 1.5, flexWrap: 'wrap' }}>
                      {task.createdAt > 0 && (
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          Created: {new Date(task.createdAt).toLocaleString()}
                        </Typography>
                      )}
                      {task.createdBy && (
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                          By: {task.createdBy}
                        </Typography>
                      )}
                      {task.completedAt !== undefined && task.completedAt > 0 && (
                        <Typography variant="caption" sx={{ color: '#22c55e' }}>
                          Completed: {new Date(task.completedAt).toLocaleString()}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                </Collapse>
              )}
            </Box>
          );
        })}

              {/* Show more button */}
              {hasMore && (
                <Box 
                  sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    pt: 1,
                  }}
                >
                  <Box
                    component="button"
                    onClick={() => setVisibleCount(prev => prev + TASKS_PER_PAGE)}
                    sx={{
                      px: 3,
                      py: 1,
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      bgcolor: 'rgba(255,255,255,0.05)',
                      color: 'text.secondary',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        bgcolor: 'rgba(255, 102, 0, 0.1)',
                        borderColor: 'rgba(255, 102, 0, 0.3)',
                        color: '#ff6600',
                      },
                    }}
                  >
                    Show more ({remaining} remaining)
                  </Box>
                </Box>
              )}
            </>
          );
        })()}
      </Box>
    </Box>
  );
};

export default TaskEditor;
