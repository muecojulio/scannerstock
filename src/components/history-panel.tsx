import { useEffect, useState } from "react";
import { listScans } from "@/lib/market.functions";

type Row = { ticker: string; model: number; verdict: string; scanned_at: string };

export function HistoryPanel() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    listScans()
      .then((data) => {
        if (live) setRows(data);
      })
      .catch((caught: unknown) => {
        if (live) setError(caught instanceof Error ? caught.message : "No se pudo leer el historial.");
      });
    return () => {
      live = false;
    };
  }, []);

  if (error) return <p className="text-sm text-clay">{error}</p>;
  if (!rows) return <p className="text-sm text-stone">Cargando lecturas públicas…</p>;
  if (rows.length === 0) {
    return (
      <div className="rounded-[var(--radius-card)] border border-line bg-panel p-5">
        <p className="font-display text-2xl">Sin lecturas todavía</p>
        <p className="mt-2 text-sm text-stone">Cada escaneo de un ticker de la SEC deja aquí el ticker, el modelo y el veredicto. Nada más.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row, index) => (
        <li key={`${row.ticker}-${row.scanned_at}-${index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
          <div>
            <p className="font-medium">{row.ticker}</p>
            <p className="text-xs text-stone">Modelo {row.model} · {formatWhen(row.scanned_at)}</p>
          </div>
          <p className={`text-xs ${row.verdict === "BIEN" ? "text-pine" : row.verdict === "MAL" ? "text-clay" : "text-sand"}`}>
            {row.verdict === "ESTABLE/EN OBSERVACIÓN" ? "EN OBSERVACIÓN" : row.verdict}
          </p>
        </li>
      ))}
    </ul>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
}
