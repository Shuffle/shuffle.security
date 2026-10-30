import { WorkflowRunDebugger } from '@/Shuffle-Core';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';

export default function WorkflowRunDebuggerPage() {
  const { userInfo } = useAuth();
  // Resolved light/dark, never the raw "system" mode: the library's scope must
  // match the page's own colours or its panels render on the wrong tokens.
  const { resolvedTheme } = useTheme();

  return (
    <div className="w-full flex-1">
      <WorkflowRunDebugger
        userdata={userInfo}
        theme={resolvedTheme}
      />
    </div>
  );
}
