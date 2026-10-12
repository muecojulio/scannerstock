import type { ErrorComponentProps } from "@tanstack/react-router";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { SpotlightCard } from "@/components/ui/motion";
import { Badge } from "@/components/ui/status";

const FALLBACK_MESSAGE = "Algo salió mal. Intenta recargar la página.";

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return FALLBACK_MESSAGE;
}

/**
 * Pantalla de error del enrutador. Misma identidad que el resto (ink, cobre,
 * paneles) y con el mensaje en el idioma de la aplicación: el visitante no
 * debería leer un error genérico en otro idioma.
 */
export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <SpotlightCard className="w-full max-w-sm p-6 text-center" interactive={false}>
        <span className="brand-mark mx-auto size-11">
          <TriangleAlert size={20} strokeWidth={2} aria-hidden="true" />
        </span>
        <div className="mt-4 flex justify-center">
          <Badge tone="bad" icon={TriangleAlert}>
            Error
          </Badge>
        </div>
        <h1 className="mt-3 font-display text-2xl">Algo salió mal</h1>
        <p className="mt-2 text-sm break-words text-stone">{errorMessage(error)}</p>
        <ActionButton
          className="mt-4"
          block
          variant="primary"
          label="Reintentar"
          icon={RotateCcw}
          onAction={() => reset()}
        />
      </SpotlightCard>
    </main>
  );
}
