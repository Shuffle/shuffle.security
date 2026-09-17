import { User as PersonIcon } from 'lucide-react';
import { useState, useRef, useEffect, KeyboardEvent, ChangeEvent, forwardRef, useImperativeHandle } from 'react';
import { Box, TextField, TextFieldProps, Typography, Avatar } from '@mui/material';
import AgentIcon from '@/Shuffle-MCPs/components/AgentIcon';
import { useUsers, User } from '@/hooks/useUsers';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { isAIAssignee, AI_AGENT_HANDLE } from '@/lib/utils';

export interface MentionInputHandle {
  focus: () => void;
  inputElement: HTMLInputElement | HTMLTextAreaElement | null;
}

export interface MentionInputProps extends Omit<TextFieldProps, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
}

interface MentionSuggestion {
  id: string;
  username: string;
  isAI?: boolean;
}

/**
 * TextField with @mention autocomplete dropdown.
 * Shows user suggestions when typing @username.
 */
export const MentionInput = forwardRef<MentionInputHandle, MentionInputProps>(({ value, onChange, onSubmit, ...props }, ref) => {
  const { users } = useUsers();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartPos, setMentionStartPos] = useState(-1);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (inputRef.current) {
        inputRef.current.focus({ preventScroll: true });
        const len = inputRef.current.value?.length ?? 0;
        try {
          inputRef.current.setSelectionRange(len, len);
        } catch {
          /* ignore non-text inputs */
        }
      }
    },
    inputElement: inputRef.current,
  }));

  // All available users including AI Agent
  const allUsers: MentionSuggestion[] = [
    { id: 'ai-agent', username: 'AI Agent', isAI: true },
    ...users.map((u: User) => ({ id: u.id, username: u.username })),
  ];

  // Handle text change and detect @mentions
  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    
    onChange(newValue);
    
    // Find if we're in the middle of typing a mention (supports hyphens)
    const textBeforeCursor = newValue.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@([\w-]*)$/);
    
    if (mentionMatch) {
      const query = mentionMatch[1].toLowerCase();
      setMentionQuery(query);
      setMentionStartPos(mentionMatch.index!);
      
      // Filter suggestions - show more results since popup is now scrollable
      const filtered = allUsers.filter(u => {
        if (u.isAI) {
          return (
            !query ||
            'ai agent'.includes(query) ||
            'ai-agent'.includes(query) ||
            'aiagent'.includes(query) ||
            'agent'.includes(query) ||
            isAIAssignee(query)
          );
        }
        return u.username.toLowerCase().includes(query);
      });
      
      setSuggestions(filtered.slice(0, 15));
      setShowSuggestions(filtered.length > 0);
      setSelectedIndex(0);
    } else {
      setShowSuggestions(false);
      setMentionStartPos(-1);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!showSuggestions) {
      if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
        e.preventDefault();
        onSubmit();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;
      case 'Enter':
      case 'Tab':
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          insertMention(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        break;
    }
  };

  // Insert selected mention
  const insertMention = (user: MentionSuggestion) => {
    if (mentionStartPos === -1) return;
    
    const beforeMention = value.slice(0, mentionStartPos);
    const afterMention = value.slice(mentionStartPos + mentionQuery.length + 1);
    const mentionText = user.isAI ? `${AI_AGENT_HANDLE} ` : `@${user.username.replace(/\s+/g, '')} `;
    
    const newValue = beforeMention + mentionText + afterMention;
    onChange(newValue);
    setShowSuggestions(false);
    
    // Focus back to input
    setTimeout(() => {
      if (inputRef.current) {
        const newCursorPos = mentionStartPos + mentionText.length;
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <Popover open={showSuggestions} onOpenChange={setShowSuggestions}>
        <PopoverAnchor asChild>
          <TextField
            {...props}
            fullWidth
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
          />
        </PopoverAnchor>
        
        <PopoverContent 
          side="top"
          align="start" 
          sideOffset={4}
          className="w-64 max-h-64 overflow-y-auto overflow-x-hidden border border-border bg-popover p-1 text-popover-foreground shadow-xl"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Typography 
            variant="caption" 
            sx={{ 
              color: 'text.secondary', 
              px: 1, 
              py: 0.5, 
              display: 'block',
              fontWeight: 500,
              fontSize: '0.7rem',
              position: 'sticky',
              top: 0,
              bgcolor: 'hsl(var(--popover))',
              zIndex: 1,
            }}
          >
            Mention someone
          </Typography>
          
          {suggestions.map((user, idx) => (
            <Box
              key={user.id}
              onClick={() => insertMention(user)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1,
                py: 0.75,
                borderRadius: 0.75,
                cursor: 'pointer',
                bgcolor: idx === selectedIndex ? 'hsl(var(--primary) / 0.15)' : 'transparent',
                '&:hover': {
                  bgcolor: idx === selectedIndex ? 'hsl(var(--primary) / 0.2)' : 'hsl(var(--muted) / 0.5)',
                },
              }}
            >
              <Avatar
                sx={{
                  width: 22,
                  height: 22,
                  bgcolor: user.isAI ? 'hsl(var(--severity-low) / 0.2)' : 'hsl(var(--primary) / 0.2)',
                  color: user.isAI ? 'hsl(var(--severity-low))' : 'hsl(var(--primary))',
                }}
              >
                {user.isAI ? <AgentIcon size={12} /> : <PersonIcon size={12} />}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography 
                  variant="body2" 
                  sx={{ 
                    fontWeight: idx === selectedIndex ? 600 : 400,
                    color: idx === selectedIndex ? 'hsl(var(--primary))' : 'text.primary',
                    fontSize: '0.8rem',
                  }}
                >
                  {user.isAI ? 'AI Agent (@AIAgent)' : user.username}
                </Typography>
              </Box>
            </Box>
          ))}
        </PopoverContent>
      </Popover>
    </Box>
  );
});
MentionInput.displayName = 'MentionInput';

export default MentionInput;
