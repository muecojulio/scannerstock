import { createFileRoute } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { HistoryPanel } from "@/components/history-panel";

export const Route = createFileRoute("/historial")({
  component: function Historial() {
    return (
      <AppFrame>
        <HistoryPanel />
      </AppFrame>
    );
  },
});
