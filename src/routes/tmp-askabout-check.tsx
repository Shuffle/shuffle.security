import { createFileRoute } from "@tanstack/react-router";
import { AskAiWidget, API_CONFIG } from "@/Shuffle-MCPs";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

export const Route = createFileRoute("/tmp-askabout-check")({
  head: () => ({
    meta: [
      { title: "Temp Ask About Check" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TmpAskAboutCheck,
});

function TmpAskAboutCheck() {
  const { resolvedTheme } = useTheme();
  const { isAuthenticated, userInfo } = useAuth();
  return (
    <div style={{ padding: 40, minHeight: "100vh" }}>
      <h1>Temp Ask About check</h1>
      <p>Open the panel with the floating button.</p>
      <AskAiWidget
        requireSupport={false}
        isSupport={true}
        isLoggedIn={isAuthenticated}
        userdata={userInfo}
        pathname={window.location.pathname}
        search={window.location.search}
        globalUrl={API_CONFIG.baseUrl}
        theme={resolvedTheme}
      />
    </div>
  );
}
