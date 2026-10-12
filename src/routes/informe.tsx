import { createFileRoute } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { ReportView } from "@/components/report-view";

export const Route = createFileRoute("/informe")({
  component: function Informe() {
    return (
      <AppFrame>
        <ReportView />
      </AppFrame>
    );
  },
});
