import { createFileRoute } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { MethodPanel } from "@/components/method-panel";

export const Route = createFileRoute("/metodo")({
  component: function Metodo() {
    return (
      <AppFrame>
        <MethodPanel />
      </AppFrame>
    );
  },
});
