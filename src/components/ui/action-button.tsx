import {
  useCallback,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentType,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { Check, TriangleAlert } from "lucide-react";
import {
  useActionStatus,
  usePrefersReducedMotion,
  type ActionStatus,
  type ActionStatusController,
} from "@/lib/ui/hooks";
import { LiveRegion, Spinner } from "./status";

/**
 * Botón del sistema: una sola pieza para los cuatro estados.
 *
 *   inactivo  apariencia y etiqueta normales
 *   cargando  giro + etiqueta, `aria-busy`, sin doble envío
 *   éxito     marca de verificación + mensaje breve
 *   error     icono + mensaje, sacudida discreta y anuncio asertivo
 *   apagado   atenuado, sin respuesta de activación
 *
 * Decisiones que valen la pena conservar:
 *   - Mientras carga NO se usa `disabled`: se conserva el foco y se bloquea el
 *     clic con `aria-disabled`. Quitar el botón del foco a mitad de la acción
 *     deja al usuario de teclado sin saber dónde está.
 *   - El mensaje del error nunca es solo color: lleva icono y texto, y se
 *     publica en una región en vivo.
 *   - La onda de pulsación se salta con `prefers-reduced-motion`.
 */

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export type ActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children"> & {
  /** Etiqueta del estado normal. */
  label: ReactNode;
  busyLabel?: ReactNode;
  successLabel?: ReactNode;
  errorLabel?: ReactNode;
  /** Estado controlado desde fuera. Si falta, lo lleva el propio botón. */
  status?: ActionStatus;
  /**
   * Controlador de estados del dueño de la pantalla (permite, por ejemplo,
   * mostrar un medidor mientras el botón está cargando). Tiene prioridad sobre
   * el estado interno, nunca sobre `status`.
   */
  controller?: ActionStatusController;
  /** Acción asíncrona: el botón gestiona cargando / éxito / error. */
  onAction?: () => void | Promise<void>;
  onSuccess?: () => void;
  /** `onError` es un evento del DOM: aquí el nombre no puede pisarlo. */
  onFailed?: (message: string) => void;
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "md" | "sm";
  block?: boolean;
  icon?: IconComponent;
  iconAfter?: IconComponent;
  /** Anuncia el resultado por lector de pantalla (por defecto sí). */
  announce?: boolean;
};

type Ripple = { id: number; x: number; y: number };

/** Texto que se publica en la región en vivo, según el estado. */
function announcement(
  status: ActionStatus,
  labels: { busyLabel?: ReactNode; successLabel?: ReactNode; errorLabel?: ReactNode },
): string {
  if (status === "loading") return typeof labels.busyLabel === "string" ? labels.busyLabel : "";
  if (status === "success") return typeof labels.successLabel === "string" ? labels.successLabel : "Acción completada.";
  if (status === "error") {
    return typeof labels.errorLabel === "string" ? labels.errorLabel : "La acción no se pudo completar.";
  }
  return "";
}

const VARIANT: Record<NonNullable<ActionButtonProps["variant"]>, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

export function ActionButton({
  label,
  busyLabel,
  successLabel,
  errorLabel,
  status,
  controller,
  onAction,
  onSuccess,
  onFailed,
  variant = "outline",
  size = "md",
  block = false,
  icon: Icon,
  iconAfter: IconAfter,
  announce = true,
  disabled = false,
  className = "",
  ...rest
}: ActionButtonProps) {
  const internal = useActionStatus();
  const current: ActionStatus = status ?? controller?.status ?? internal.status;
  const drive = controller ?? internal;
  const busy = current === "loading";
  const reduced = usePrefersReducedMotion();
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const rippleId = useRef(0);
  const running = useRef(false);

  const addRipple = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (reduced || event.pointerType === "mouse") return;
      const rect = event.currentTarget.getBoundingClientRect();
      const next = { id: ++rippleId.current, x: event.clientX - rect.left, y: event.clientY - rect.top };
      setRipples((list) => [...list.slice(-2), next]);
      window.setTimeout(() => setRipples((list) => list.filter((item) => item.id !== next.id)), 560);
    },
    [reduced],
  );

  async function handleClick() {
    if (disabled || busy || running.current) return;
    if (!onAction) return;
    running.current = true;
    if (!status) drive.start();
    try {
      await onAction();
      if (!status) drive.succeed();
      onSuccess?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "No se pudo completar la acción.";
      if (!status) drive.fail();
      onFailed?.(message);
    } finally {
      running.current = false;
    }
  }

  const visibleLabel =
    current === "loading"
      ? (busyLabel ?? label)
      : current === "success"
        ? (successLabel ?? label)
        : current === "error"
          ? (errorLabel ?? label)
          : label;
  const Leading = busy ? null : current === "success" ? Check : current === "error" ? TriangleAlert : Icon;

  return (
    <>
      <button
        type="button"
        {...rest}
        aria-busy={busy ? "true" : undefined}
        aria-disabled={disabled || busy ? "true" : undefined}
        disabled={disabled}
        onClick={() => void handleClick()}
        onPointerDown={addRipple}
        className={`btn ${VARIANT[variant]} ${size === "sm" ? "btn-sm" : ""} ${block ? "btn-block" : ""} ${
          current === "error" ? "shake" : ""
        } ${className}`}
      >
        {busy ? <Spinner size={16} /> : Leading ? <Leading size={17} strokeWidth={2} aria-hidden="true" /> : null}
        <span>{visibleLabel}</span>
        {!busy && IconAfter && current === "idle" ? <IconAfter size={17} strokeWidth={2} aria-hidden="true" /> : null}
        {ripples.map((ripple) => (
          <span
            key={ripple.id}
            className="btn-ripple"
            aria-hidden="true"
            style={{ "--ripple-x": `${ripple.x}px`, "--ripple-y": `${ripple.y}px` } as CSSProperties}
          />
        ))}
      </button>
      {announce ? <LiveRegion assertive={current === "error"} message={announcement(current, { busyLabel, successLabel, errorLabel })} /> : null}
    </>
  );
}
