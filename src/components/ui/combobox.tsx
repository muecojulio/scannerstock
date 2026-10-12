import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { filterOptions } from "@/lib/ui/gestures";
import { useOutsidePointer } from "@/lib/ui/hooks";
import { LiveRegion, Spinner } from "./status";

/**
 * Campo con búsqueda y lista de opciones (patrón combobox de ARIA).
 *
 *   - Filtra mientras se escribe sin distinguir mayúsculas, minúsculas ni
 *     acentos (`normalizeText`).
 *   - Semántica completa: `role="combobox"` con `aria-expanded`,
 *     `aria-controls`, `aria-autocomplete="list"` y `aria-activedescendant`;
 *     la lista es `role="listbox"` y cada opción `role="option"` con
 *     `aria-selected`.
 *   - Teclado: flechas arriba/abajo para recorrer (abren la lista), Inicio y
 *     Fin, Enter para confirmar, Escape para cerrar y Tab para salir.
 *   - La opción activa se mantiene visible y el foco nunca se va del campo: la
 *     selección se confirma sin mover el foco, así se puede seguir escribiendo.
 *   - Se cierra al tocar fuera, tiene un control visible para abrir/cerrar y,
 *     si la lista es larga, se desplaza dentro de sí misma sin arrastrar la
 *     página (`overscroll-contain`).
 */

export type ComboOption = {
  value: string;
  label: string;
  /** Texto secundario (nombre de la empresa, sector…). Participa del filtro. */
  hint?: string;
};

export function ComboBox({
  id,
  label,
  hint,
  value,
  onValueChange,
  options,
  onSelect,
  loading = false,
  placeholder = "",
  emptyMessage = "Sin coincidencias",
  filterLocal = true,
  autoCapitalize = "none",
  inputClassName = "",
}: {
  id?: string;
  label: string;
  /** Ayuda bajo la etiqueta; no sustituye al `label`. */
  hint?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly ComboOption[];
  /** Si se omite, elegir una opción solo cambia el valor. */
  onSelect?: (option: ComboOption) => void;
  loading?: boolean;
  placeholder?: string;
  emptyMessage?: string;
  /** Filtra en el cliente además de lo que ya filtró quien provee las opciones. */
  filterLocal?: boolean;
  autoCapitalize?: string;
  inputClassName?: string;
}) {
  const base = useId();
  const inputId = id ?? `combo-${base}`;
  const listId = `list-${base}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const visible = useMemo(
    () => (filterLocal ? filterOptions(options, value, (option) => `${option.label} ${option.hint ?? ""}`) : [...options]),
    [filterLocal, options, value],
  );

  useOutsidePointer(rootRef, () => setOpen(false), open);

  // La opción activa nunca queda fuera de vista dentro de la lista.
  useEffect(() => {
    if (!open || active < 0) return;
    const node = listRef.current?.querySelectorAll<HTMLElement>("[role='option']")[active];
    node?.scrollIntoView({ block: "nearest" });
  }, [active, open, visible.length]);

  // Si la lista cambia (llegaron resultados), el índice activo se recalcula.
  useEffect(() => {
    setActive((current) => (current >= visible.length ? visible.length - 1 : current));
  }, [visible.length]);

  function commit(option: ComboOption) {
    onValueChange(option.value);
    onSelect?.(option);
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (!open) return;
      event.stopPropagation();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(event.key === "ArrowDown" ? 0 : visible.length - 1);
        return;
      }
      if (visible.length === 0) return;
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => {
        if (current < 0) return delta === 1 ? 0 : visible.length - 1;
        return (current + delta + visible.length) % visible.length;
      });
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActive(visible.length - 1);
      return;
    }
    if (event.key === "Enter") {
      const option = visible[active];
      if (!open || !option) return;
      event.preventDefault();
      commit(option);
    }
  }

  const status = loading
    ? "Buscando coincidencias"
    : open && value.trim().length > 0
      ? visible.length === 0
        ? `Sin coincidencias para ${value.trim()}`
        : `${visible.length} ${visible.length === 1 ? "coincidencia" : "coincidencias"} disponibles`
      : "";

  return (
    <div ref={rootRef} className="relative">
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-[11px] text-stone">{hint}</p> : null}

      <div className="relative mt-1.5">
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          /* La lista solo existe cuando está abierta: sin referencia colgante. */
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 && visible[active] ? `${listId}-${active}` : undefined}
          aria-busy={loading ? "true" : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoCapitalize={autoCapitalize}
          enterKeyHint="search"
          className={`field field-with-actions ${inputClassName}`}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            onValueChange(event.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (options.length > 0) setOpen(true);
          }}
        />
        <div className="absolute inset-y-0 right-1.5 flex items-center gap-0.5">
          {loading ? <Spinner size={15} label="Buscando" /> : null}
          {value ? (
            <button
              type="button"
              className="grid size-11 place-items-center rounded-full text-stone transition-colors hover:text-ivory"
              aria-label="Borrar el texto"
              onClick={() => {
                onValueChange("");
                setActive(-1);
                setOpen(false);
                inputRef.current?.focus();
              }}
            >
              <X size={16} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : null}
          <button
            type="button"
            className="grid size-11 place-items-center rounded-full text-stone transition-colors hover:text-ivory"
            aria-label={open ? "Ocultar sugerencias" : "Mostrar sugerencias"}
            aria-expanded={open}
            onClick={() => {
              setOpen((current) => !current);
              inputRef.current?.focus();
            }}
          >
            {open ? <ChevronDown size={18} strokeWidth={2} className="rotate-180 transition-transform" aria-hidden="true" /> : <Search size={16} strokeWidth={2} aria-hidden="true" />}
          </button>
        </div>

        {open ? (
          <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-2xl border border-line bg-panel shadow-[var(--shadow-lift)]">
            {visible.length === 0 ? (
              <p className="px-3 py-3 text-sm text-stone">
                {loading ? "Buscando…" : `${emptyMessage}${value.trim() ? ` para «${value.trim()}»` : ""}`}
              </p>
            ) : (
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                aria-label={`Sugerencias de ${label}`}
                className="max-h-64 overflow-y-auto overscroll-contain py-1"
              >
                {visible.map((option, index) => (
                  <li
                    key={`${option.value}-${index}`}
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={option.value === value}
                    data-active={index === active}
                    className="option cursor-pointer"
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerMove={() => setActive(index)}
                    onClick={() => commit(option)}
                  >
                    <span className="font-medium">{option.label}</span>
                    {option.hint ? <span className="truncate text-xs text-stone">{option.hint}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <LiveRegion message={status} />
    </div>
  );
}
