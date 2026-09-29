/**
 * Weekly Schedule Timeline Component
 * Displays a visual calendar view of on-call rotations for the week ahead
 */

import { useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Tooltip,
  Avatar,
  Chip,
} from '@mui/material';
import AgentIcon from '@/Shuffle-Core/components/AgentIcon';

type EscalationLevel = 'tier1' | 'tier2' | 'tier3' | 'manager';

interface ScheduleEntry {
  id: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  daysOfWeek: number[];
}

interface UserSchedule {
  userId: string;
  userName: string;
  userEmail: string;
  escalationLevel: EscalationLevel;
  schedules: ScheduleEntry[];
  enabled: boolean;
}

interface WeeklyScheduleTimelineProps {
  userSchedules: UserSchedule[];
}

const ESCALATION_COLORS: Record<EscalationLevel, string> = {
  tier1: '#4caf50',
  tier2: '#2196f3',
  tier3: '#ff9800',
  manager: '#f44336',
};

const AI_AGENT_COLOR = '#9c27b0';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Get the next 7 days starting from today
const getWeekDays = () => {
  const days = [];
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    days.push(date);
  }
  return days;
};

// Check if a user is on-call at a specific date and hour
const isUserOnCall = (
  schedule: UserSchedule,
  date: Date,
  hour: number
): boolean => {
  if (!schedule.enabled) return false;
  
  const dayOfWeek = date.getDay();
  const dateStr = date.toISOString().split('T')[0];
  
  return schedule.schedules.some(entry => {
    // Check if date is within range
    if (dateStr < entry.startDate || dateStr > entry.endDate) return false;
    
    // Check if day of week is included
    if (!entry.daysOfWeek.includes(dayOfWeek)) return false;
    
    // Check if hour is within time range
    const startHour = parseInt(entry.startTime.split(':')[0], 10);
    const endHour = parseInt(entry.endTime.split(':')[0], 10);
    
    if (endHour > startHour) {
      return hour >= startHour && hour < endHour;
    } else {
      // Overnight shift
      return hour >= startHour || hour < endHour;
    }
  });
};

// AI Agent is always on-call (24/7 fallback)
const AI_AGENT_SCHEDULE: UserSchedule = {
  userId: 'ai-agent',
  userName: 'AI Agent',
  userEmail: 'ai@shuffle.io',
  escalationLevel: 'tier1',
  schedules: [{
    id: 'ai-agent-schedule',
    startDate: '2020-01-01',
    endDate: '2099-12-31',
    startTime: '00:00',
    endTime: '00:00', // 24 hours
    timezone: 'UTC',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  }],
  enabled: true,
};

export const WeeklyScheduleTimeline = ({ userSchedules }: WeeklyScheduleTimelineProps) => {
  const weekDays = useMemo(() => getWeekDays(), []);
  
  // Include AI Agent in the schedules
  const allSchedules = useMemo(() => {
    const hasAiAgent = userSchedules.some(s => s.userId === 'ai-agent');
    if (hasAiAgent) return userSchedules;
    return [AI_AGENT_SCHEDULE, ...userSchedules];
  }, [userSchedules]);
  
  // Get users on-call for each hour slot
  const getOnCallUsers = (date: Date, hour: number): UserSchedule[] => {
    return allSchedules.filter(schedule => {
      if (schedule.userId === 'ai-agent') {
        // AI Agent is always on-call but shows as fallback
        return true;
      }
      return isUserOnCall(schedule, date, hour);
    });
  };
  
  // Check if any human is on-call at a given time
  const hasHumanCoverage = (date: Date, hour: number): boolean => {
    return allSchedules.some(schedule => 
      schedule.userId !== 'ai-agent' && isUserOnCall(schedule, date, hour)
    );
  };

  return (
    <Paper 
      sx={{ 
        p: 3, 
        mb: 4,
        bgcolor: 'hsl(var(--card))',
        border: '1px solid hsl(var(--border))',
        overflow: 'hidden',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Typography variant="h6" sx={{ color: 'hsl(var(--foreground))' }}>
          Weekly On-Call Schedule
        </Typography>
        <Chip
          label="Beta"
          size="small"
          sx={{
            height: 20,
            fontSize: '0.7rem',
            fontWeight: 600,
            bgcolor: 'hsl(var(--primary) / 0.1)',
            color: 'hsl(var(--primary))',
            border: '1px solid hsl(var(--primary) / 0.25)',
            borderRadius: 1,
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
      </Box>
      
      {/* Legend */}
      <Box sx={{ display: 'flex', gap: 3, mb: 3, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 16, height: 16, borderRadius: 1, bgcolor: AI_AGENT_COLOR }} />
          <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
            AI Agent (24/7 Fallback)
          </Typography>
        </Box>
        {Object.entries(ESCALATION_COLORS).map(([level, color]) => (
          <Box key={level} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ width: 16, height: 16, borderRadius: 1, bgcolor: color }} />
            <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
              {level.charAt(0).toUpperCase() + level.slice(1).replace(/(\d)/, ' $1')}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* Timeline Grid */}
      <Box sx={{ overflowX: 'auto' }}>
        <Box sx={{ minWidth: 900 }}>
          {/* Header row with hours */}
          <Box sx={{ display: 'flex', borderBottom: '1px solid hsl(var(--border))' }}>
            <Box sx={{ width: 100, flexShrink: 0, p: 1 }} />
            {[0, 6, 12, 18].map(hour => (
              <Box 
                key={hour} 
                sx={{ 
                  flex: 1, 
                  p: 1, 
                  textAlign: 'center',
                  borderLeft: '1px solid hsl(var(--border))',
                }}
              >
                <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                  {hour.toString().padStart(2, '0')}:00
                </Typography>
              </Box>
            ))}
          </Box>

          {/* Day rows */}
          {weekDays.map((date, dayIndex) => {
            const isToday = date.toDateString() === new Date().toDateString();
            
            return (
              <Box 
                key={dayIndex} 
                sx={{ 
                  display: 'flex', 
                  borderBottom: '1px solid hsl(var(--border))',
                  bgcolor: isToday ? 'hsl(var(--primary) / 0.05)' : 'transparent',
                }}
              >
                {/* Day label */}
                <Box 
                  sx={{ 
                    width: 100, 
                    flexShrink: 0, 
                    p: 1.5,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontWeight: isToday ? 600 : 400,
                      color: isToday ? 'hsl(var(--primary))' : 'hsl(var(--foreground))',
                    }}
                  >
                    {DAYS_SHORT[date.getDay()]}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'hsl(var(--muted-foreground))' }}>
                    {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Typography>
                </Box>

                {/* Hour blocks - grouped into 6-hour segments for display */}
                {[0, 6, 12, 18].map(segmentStart => (
                  <Box 
                    key={segmentStart}
                    sx={{ 
                      flex: 1,
                      display: 'flex',
                      borderLeft: '1px solid hsl(var(--border))',
                      minHeight: 48,
                    }}
                  >
                    {HOURS.slice(segmentStart, segmentStart + 6).map(hour => {
                      const onCallUsers = getOnCallUsers(date, hour);
                      const hasHuman = hasHumanCoverage(date, hour);
                      const primaryUser = onCallUsers.find(u => u.userId !== 'ai-agent') || onCallUsers[0];
                      
                      return (
                        <Tooltip
                          key={hour}
                          title={
                            <Box>
                              <Typography variant="body2" fontWeight="bold">
                                {hour.toString().padStart(2, '0')}:00 - {(hour + 1).toString().padStart(2, '0')}:00
                              </Typography>
                              {onCallUsers.map(user => (
                                <Typography key={user.userId} variant="body2">
                                  {user.userName} {user.userId === 'ai-agent' && !hasHuman ? '(Active)' : user.userId === 'ai-agent' ? '(Fallback)' : ''}
                                </Typography>
                              ))}
                            </Box>
                          }
                          arrow
                        >
                          <Box
                            sx={{
                              flex: 1,
                              bgcolor: primaryUser
                                ? primaryUser.userId === 'ai-agent'
                                  ? hasHuman
                                    ? 'transparent'
                                    : `${AI_AGENT_COLOR}40`
                                  : `${ESCALATION_COLORS[primaryUser.escalationLevel]}60`
                                : 'transparent',
                              borderRight: hour < segmentStart + 5 ? '1px solid hsl(var(--border) / 0.3)' : 'none',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'background-color 0.2s',
                              cursor: 'pointer',
                              '&:hover': {
                                bgcolor: primaryUser
                                  ? primaryUser.userId === 'ai-agent'
                                    ? `${AI_AGENT_COLOR}60`
                                    : `${ESCALATION_COLORS[primaryUser.escalationLevel]}80`
                                  : 'hsl(var(--muted) / 0.3)',
                              },
                            }}
                          >
                            {/* Show avatar for first hour of each user's shift */}
                            {primaryUser && primaryUser.userId !== 'ai-agent' && hour % 4 === 0 && (
                              <Avatar 
                                sx={{ 
                                  width: 20, 
                                  height: 20, 
                                  fontSize: '0.65rem',
                                  bgcolor: ESCALATION_COLORS[primaryUser.escalationLevel],
                                }}
                              >
                                {primaryUser.userName.charAt(0).toUpperCase()}
                              </Avatar>
                            )}
                            {primaryUser?.userId === 'ai-agent' && !hasHuman && hour % 6 === 0 && (
                              <AgentIcon size={16} />
                            )}
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Summary */}
      <Box sx={{ mt: 3, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'hsl(var(--muted-foreground))' }}>
          Currently on-call: {' '}
          {(() => {
            const now = new Date();
            const currentUsers = getOnCallUsers(now, now.getHours());
            const humanUsers = currentUsers.filter(u => u.userId !== 'ai-agent');
            if (humanUsers.length > 0) {
              return humanUsers.map(u => u.userName).join(', ');
            }
            return 'AI Agent (no human coverage)';
          })()}
        </Typography>
      </Box>
    </Paper>
  );
};

export { AI_AGENT_SCHEDULE };
export type { UserSchedule, ScheduleEntry, EscalationLevel };
