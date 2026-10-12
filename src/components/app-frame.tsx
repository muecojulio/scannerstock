import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, FileText, History, ScanSearch } from "lucide-react";
import type { ReactNode } from "react";

const tabs = [
  { id: "escanear", href: "/", label: "Escanear", icon: ScanSearch },
  { id: "informe", href: "/informe", label: "Informe", icon: FileText },
  { id: "historial", href: "/historial", label: "Historial", icon: History },
  { id: "metodo", href: "/metodo", label: "Método", icon: BookOpen },
] as const;

export function AppFrame({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-ink/90 px-5 pt-[max(0.85rem,env(safe-area-inset-top))] pb-3 backdrop-blur-md">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-display text-2xl leading-none tracking-tight text-ivory">ScannerStock</p>
            <p className="mt-1 text-xs tracking-wide text-stone">Diagnóstico fundamental estricto</p>
          </div>
          <Link
            to="/privacidad"
            className="press press-active rounded-full border border-line px-3 py-2 text-xs text-stone"
          >
            Privacidad
          </Link>
        </div>
      </header>
      <main className="flex-1 px-5 pt-5 pb-28">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-lg grid-cols-4 px-2 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
          {tabs.map((tab) => {
            const active = path === tab.href;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                to={tab.href}
                className={`press press-active flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] ${
                  active ? "text-copper" : "text-stone"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
