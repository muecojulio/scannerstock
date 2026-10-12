import * as Switch from "@radix-ui/react-switch";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

/**
 * Campos, interruptores y paneles plegables.
 *
 *   - Todo campo lleva etiqueta visible: el `placeholder` nunca es el nombre.
 *   - El foco se marca con borde y halo (`--color-copper`), sin saltos de
 *     tamaño que muevan el diseño.
 *   - El interruptor usa `role="switch"` y `aria-checked` (los pone Radix) y
 *     anuncia su estado también con texto: "Activado" / "Desactivado".
 *   - Los paneles plegables animan su altura real (medida con
 *     `ResizeObserver`), no un `max-height` adivinado, y actualizan
 *     `aria-expanded` / `aria-controls`. Con movimiento reducido abren y
 *     cierran de golpe, sin animación.
 */

export function TextField({
  label,
  hint,
  error,
  id,
  className = "",
  inputClassName = "",
  ...rest
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  inputClassName?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const generated = useId();
  const fieldId = id ?? `field-${generated}`;
  const describedBy = [hint ? `${fieldId}-hint` : null, error ? `${fieldId}-error` : null].filter(Boolean).join(" ");

  return (
    <div className={className}>
      <label className="field-label" htmlFor={fieldId}>
        {label}
      </label>
      <input
        {...rest}
        id={fieldId}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy || undefined}
        className={`field mt-1.5 ${inputClassName}`}
      />
      {hint ? (
        <p id={`${fieldId}-hint`} className="mt-1 text-[11px] leading-relaxed text-stone">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${fieldId}-error`} className="mt-1 text-[11px] text-clay">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  id,
  className = "",
}: {
  label: string;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  className?: string;
}) {
  const generated = useId();
  const switchId = id ?? `switch-${generated}`;

  return (
    <div className={`flex items-start justify-between gap-3 ${className}`}>
      <span className="min-w-0">
        <label htmlFor={switchId} className="text-sm">
          {label}
        </label>
        {description ? <span className="mt-0.5 block text-xs text-stone">{description}</span> : null}
        {/* El estado, también en texto: no depende del color ni del movimiento. */}
        <span className="mt-1 block text-[11px] font-medium tracking-wide text-stone">
          {checked ? "Activado" : "Desactivado"}
        </span>
      </span>
      <Switch.Root
        id={switchId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="relative h-7 w-12 shrink-0 rounded-full border border-line bg-ink transition-colors data-[state=checked]:border-copper data-[state=checked]:bg-copper/30"
        aria-label={label}
      >
        <Switch.Thumb className="block size-5 translate-x-1 rounded-full bg-stone transition-transform duration-200 data-[state=checked]:translate-x-6 data-[state=checked]:bg-ivory" />
      </Switch.Root>
    </div>
  );
}

/**
 * Panel plegable. La altura se mide del contenido real, así que abrir y cerrar
 * se anima igual de bien con dos líneas que con veinte.
 */
export function Disclosure({
  title,
  summary,
  icon: Icon,
  children,
  defaultOpen = false,
  tone = "panel",
}: {
  title: string;
  summary?: ReactNode;
  icon?: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: "panel" | "plain";
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);
  const panelId = `disclosure-${useId()}`;

  useEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const measure = () => setHeight(node.scrollHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      className={
        tone === "panel"
          ? "surface overflow-hidden"
          : "overflow-hidden border-b border-line-soft last:border-b-0"
      }
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((current) => !current)}
          className={`flex w-full items-center gap-3 text-left ${tone === "panel" ? "px-4 py-3.5" : "py-3"}`}
        >
          {Icon ? (
            <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-line bg-panel-2 text-copper">
              <Icon size={16} strokeWidth={2} aria-hidden="true" />
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ivory">{title}</span>
            {summary ? <span className="mt-0.5 block text-xs text-stone">{summary}</span> : null}
          </span>
          <ChevronDown
            size={18}
            strokeWidth={2}
            aria-hidden="true"
            className={`shrink-0 text-stone transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          />
        </button>
      </h2>
      <div
        id={panelId}
        className="overflow-hidden transition-[height] duration-[240ms] ease-[var(--ease-smooth)]"
        style={{ height: open ? (height ?? undefined) : 0 }}
        inert={!open}
        aria-hidden={!open}
      >
        <div ref={contentRef} className={tone === "panel" ? "px-4 pb-4" : "pb-4"}>
          {children}
        </div>
      </div>
    </section>
  );
}
