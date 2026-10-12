import { Link, useRouterState } from "@tanstack/react-router";
import { BookOpen, FileText, History, ScanSearch } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/ui/status";

const TABS = [
  { id: "escanear", href: "/", label: "Escanear", icon: ScanSearch },
  { id: "informe", href: "/informe", label: "Informe", icon: FileText },
  { id: "historial", href: "/historial", label: "Historial", icon: History },
  { id: "metodo", href: "/metodo", label: "Método", icon: BookOpen },
] as const;

/** Frases de la cinta del encabezado. Decorativa: no informa de nada nuevo. */
const TAPE = [
  "Modelo 1 · Regulares",
  "Modelo 2 · Bancos",
  "Modelo 3 · Utilities",
  "Modelo 4 · REITs",
  "Filings XBRL de la SEC",
  "Caché de 12 horas",
  "Sin cuenta y sin rastreo",
];

/**
 * Marco de la aplicación: fondo vivo, cabecera, navegación inferior con
 * píldora deslizante y cambio de sección por gesto.
 *
 * El gesto lateral de la página se comporta como el de las pestañas: empieza
 * solo cuando el eje es claramente horizontal, nunca sobre un control y nunca
 * dentro de un carril (`data-gesture-scroller`), para que deslizar una tarjeta
 * o un carril no cambie de sección por accidente.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const index = Math.max(
    0,
    TABS.findIndex((tab) => tab.href === path),
  );

  /*
   * Aquí NO hay gesto lateral de página, y es a propósito.
   *
   * Para recibir un arrastre horizontal en una página que se desplaza en
   * vertical haría falta `touch-action: pan-y` en este contenedor. Pero el
   * comportamiento táctil efectivo de un elemento es la intersección de su
   * `touch-action` con la de sus ancestros hasta el contenedor de scroll más
   * cercano: un `pan-y` en `<main>` dejaría a los carriles de dentro sin poder
   * desplazarse con el dedo. Los carriles son nativos por diseño, así que el
   * gesto lateral vive donde no rompe nada: en los paneles de pestañas
   * (`.swipe-viewport`) y en las filas deslizables (`.swipe-content`), que no
   * contienen carriles. La navegación entre secciones queda en la barra
   * inferior, el teclado y el historial del navegador.
   */

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col">
      <div className="stage" aria-hidden="true">
        <span className="stage-aurora" />
        <span className="stage-grid" />
        <span className="stage-noise" />
      </div>

      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <header className="app-header sticky top-0 z-20 border-b border-line/80 bg-ink/90 px-5 pt-[max(0.85rem,env(safe-area-inset-top))] pb-2.5 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="brand-mark size-10 shrink-0">
              <ScanSearch size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="font-display text-xl leading-none tracking-tight">
                <span className="text-gradient-copper">ScannerStock</span>
              </p>
              <p className="mt-1 truncate text-[11px] tracking-wide text-stone">Diagnóstico fundamental estricto</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone="live" pulse>
              SEC
            </Badge>
            <Link to="/privacidad" className="btn btn-sm btn-ghost">
              Privacidad
            </Link>
          </div>
        </div>

        {/* Cinta de datos: lenta, decorativa y en pausa al pasar el ratón. */}
        <div className="tape mt-2.5" aria-hidden="true">
          <div className="tape-track">
            {[...TAPE, ...TAPE].map((item, itemIndex) => (
              <span key={itemIndex} className="flex items-center gap-2 whitespace-nowrap text-[11px] text-stone/90">
                <span className="size-1 rounded-full bg-copper-soft" />
                {item}
              </span>
            ))}
          </div>
        </div>
      </header>

      <main id="contenido" className="flex-1 px-5 pt-5 pb-28">
        <div key={path} className="page-enter">
          {children}
        </div>
      </main>

      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur-md"
      >
        <div
          className="nav-track relative mx-auto grid max-w-lg grid-cols-4 px-2 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]"
          style={{ "--nav-index": index } as CSSProperties}
        >
          {/* La cuadrícula reparte las cuatro secciones por igual, así que la
              píldora se coloca con aritmética y no con medidas del DOM: se
              desliza igual en el primer render del servidor. */}
          <span className="nav-pill" aria-hidden="true" />
          {TABS.map((tab) => {
            const active = tab.href === path;
            const Icon = tab.icon;
            return (
              <Link
                key={tab.id}
                to={tab.href}
                aria-current={active ? "page" : undefined}
                className="nav-item"
              >
                <Icon size={19} strokeWidth={active ? 2.2 : 1.7} aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
