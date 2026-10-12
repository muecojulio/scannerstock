import { createFileRoute } from "@tanstack/react-router";
import { AppFrame } from "@/components/app-frame";
import { ScanDesk } from "@/components/scan-desk";

export const Route = createFileRoute("/")({
  component: function Home() {
    return (
      <AppFrame>
        <ScanDesk />
      </AppFrame>
    );
  },
});
