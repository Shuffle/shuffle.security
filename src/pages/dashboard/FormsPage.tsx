/**
 * FormsPage — host wrapper that bridges AuthContext + API_CONFIG into the
 * standalone FormInput component from `@/Shuffle-Core`.
 *
 * Routes:
 *   /forms        -> list of forms (no id selected)
 *   /forms/:id    -> a specific form's run page
 *
 * Several FormInput sub-components are STUBBED in `@/Shuffle-Core/components/stubs`
 * (UsecaseSearch, WorkflowGrid, WorkflowTemplatePopup, WorkflowValidationTimeline,
 * AppCreator useStyles). They render placeholders or null until ported.
 */
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { API_CONFIG } from '@/Shuffle-Core/api';
import { FormInput } from '@/Shuffle-Core';

const FormsPage = () => {
  const { userInfo, isAuthenticated } = useAuth();
  const { resolvedTheme } = useTheme();
  return (
    <FormInput
      globalUrl={API_CONFIG.baseUrl}
      theme={resolvedTheme}
      userdata={userInfo || {}}
      isLoaded={true}
      isLoggedIn={!!isAuthenticated}
      setIsLoggedIn={() => {}}
      setCookie={() => {}}
      register={false}
      serverside={false}
    />
  );
};

export default FormsPage;
