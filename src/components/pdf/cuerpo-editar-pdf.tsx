"use client";

// ==========================================================================
// CuerpoElegir (PDF1020B) — la lista de operaciones y su formulario mínimo.
// ==========================================================================
import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { camposFaltantes, type OperacionPdf } from "@/lib/pdf/operaciones-pdf";

export interface PropsElegir {
  operaciones: OperacionPdf[];
  aviso: string;
  op: OperacionPdf | null;
  onOp: (op: OperacionPdf) => void;
  alOk: (blob: Blob, tipo: string) => void;
  alFallo: (mensaje: string) => void;
  alVolver: () => void;
  clientePdfEjecutar: (op: OperacionPdf, valores: Record<string, string>) => Promise<{ ok: boolean; blob?: Blob; contentType?: string; error?: string }>;
}

const BOTON =
  "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] " +
  "px-3 min-h-[44px] text-sm font-semibold text-white/80 transition-colors hover:border-white/30 hover:bg-white/10 hover:text-white";

export function CuerpoElegir(p: PropsElegir) {
  const [valores, setValores] = useState<Record<string, string>>({});
  const [falta, setFalta] = useState("");
  const [ejecutando, setEjecutando] = useState(false);
  const ids = p.op?.id ?? "";

  useEffect(() => {
    setFalta("");
    setValores(Object.fromEntries((p.op?.params ?? []).map((q) => [q.id, q.defecto ?? ""])));
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p.op) {
    return (
      <div className="space-y-2">
        {p.aviso && <p role="note" className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">{p.aviso}</p>}
        {p.operaciones.length === 0 && <p className="py-4 text-sm text-white/60">El servidor no ofrece ninguna operación de edición.</p>}
        <div role="list" aria-label="Operaciones disponibles" className="grid grid-cols-2 gap-2">
          {p.operaciones.map((o) => (
            <button key={o.id} role="listitem" type="button" title={o.descripcion} aria-label={o.etiqueta}
              onClick={() => p.onOp(o)}
              className={cn(BOTON, "justify-start text-left text-[12px] font-semibold")}>
              <span className="truncate">{o.etiqueta}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (ejecutando) return <p className="flex items-center gap-2 py-8 text-sm text-white/60" aria-busy="true">Estoy ejecutando la operación…</p>;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase tracking-wider text-white/60">{p.op.etiqueta}</h3>
      <p className="text-[11px] text-white/60">{p.op.descripcion}</p>
      {p.op.params.map((q) => (
        <div key={q.id}>
          <label className="block text-xs font-semibold text-white/75" htmlFor={`par-${p.op!.id}-${q.id}`}>{q.etiqueta}</label>
          {q.tipo === "lista" && q.opiciones ? (
            <select id={`par-${p.op!.id}-${q.id}`} value={valores[q.id] ?? ""} aria-required={q.obligatorio}
              onChange={(e) => setValores({ ...valores, [q.id]: e.target.value })}
              className="h-11 w-full cursor-pointer rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white/90 focus:border-emerald-400/50">
              {q.opciones.map((o) => <option key={o} value={o} className="bg-[#12121a]">{o}</option>)}
            </select>
          ) : (
            <input id={`par-${p.op!.id}-${q.id}`} type={q.tipo === "numero" ? "number" : "text"} aria-required={q.obligatorio}
              value={valores[q.id] ?? ""} placeholder={q.ejemplo ?? ""}
              onChange={(e) => setValores({ ...valores, [q.id]: e.target.value })}
              className="h-11 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white/90 focus:border-emerald-400/50" />
          )}
        </div>
      ))}
      {falta && <p role="alert" className="text-[11px] text-rose-200">{falta}</p>}
      <div className="flex gap-2">
        <button type="button" className={cn(BOTON, "flex-1")} onClick={() => p.alVolver()}>Volver</button>
        <button type="button" className={cn(BOTON, "flex-1 border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25")}
          onClick={() => {
            const faltan = camposFaltantes(p.op, valores);
            if (faltan.length > 0) { setFalta(`Faltan campos: ${faltan.join(", ")}.`); return; }
            setEjecutando(true);
            void p.clientePdfEjecutar(p.op, valores).then((r) => {
              if (!r.ok || !r.blob) { setEjecutando(false); p.alFallo(r.error || "La operación falló sin explicación."); return; }              setEjecutando(false);
              p.alOk(r.blob, r.contentType ?? "");
            });
          }}>
          Ejecutar
        </button>
      </div>
    </div>
  );
}
