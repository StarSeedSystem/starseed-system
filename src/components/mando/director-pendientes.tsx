"use client";

/**
 * Pestaña Director del Mando (2/3 · p318G) — tareas pendientes.
 * Resumen con seis cifras, lista de bloqueadas con dependencia, lista de fallos
 * con nota, botón Reintentar por fila con estado de carga y resultado.
 */

import { useState } from "react";
import { RotateCw } from "lucide-react";
import type { ResumenPendientes } from "@/lib/mando/director-datos";
import { MarcoWidget } from "@/components/dashboard/kit/marco-widget";

async function reasignarCola(tarea: string): Promise<{ ok: boolean; detalle: string }> {
  try {
    const r = await fetch("/api/mando/colas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accion: "reasignar", nombre: "", tarea, dondeActual: "mac" }),
    });
    const cuerpo = (await r.json()) as { ok?: boolean; detalle?: string; error?: string };
    return { ok: Boolean(cuerpo.ok), detalle: cuerpo.detalle ?? cuerpo.error ?? `HTTP ${r.status}` };
  } catch { return { ok: false, detalle: "No se pudo hablar con el Mando." }; }
}

function FilaBloqueada({ bloqueada }: { bloqueada: { id: string; dependeDe: string[] } }) {
  const dependencia = bloqueada.dependeDe.length > 0 ? bloqueada.dependeDe[0] : "dependencia sin nombre";
  return (
    <li className="rounded-lg border border-border/20 bg-black/10 px-3 py-2 text-xs" data-testid={`bloqueada-${bloqueada.id}`}>
      <span className="text-foreground/90">
        {bloqueada.id} espera {dependencia}
      </span>
    </li>
  );
}
function FilaFallo({ fallo }: { fallo: { id: string; estado: string; nota: string } }) {
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null);
  const onReintentar = async () => {
    setOcupado(true);
    setResultado(await reasignarCola(fallo.id));
    setOcupado(false);
  };
  return (
    <li className="flex flex-col gap-1.5 rounded-lg border border-border/20 bg-black/10 px-3 py-2 text-xs" data-testid={`fallo-${fallo.id}`}>
      <div className="flex items-center justify-between">
        <span className="font-bold text-foreground/90">{fallo.id}</span>
        <span className="text-[10px] text-rose-400/80">{fallo.estado}</span>
      </div>
      {fallo.nota ? <p className="text-[10px] text-muted-foreground/70">{fallo.nota}</p> : null}
      <button
        type="button"
        disabled={ocupado}
        onClick={() => void onReintentar()}
        className="w-fit cursor-pointer rounded-full border border-amber-400/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <RotateCw className={ocupado ? "inline-block size-3 animate-spin mr-1" : "inline-block size-3 mr-1"} aria-hidden />
        {ocupado ? "Reintentando…" : "Reintentar"}
      </button>
      {resultado ? <p className={`text-[10px] ${resultado.ok ? "text-emerald-400/80" : "text-rose-400/80"}`}>{resultado.detalle}</p> : null}
    </li>
  );
}
export function DirectorPendientes({ pendientes }: { pendientes: ResumenPendientes }) {
  return (
    <MarcoWidget titulo="Pendientes" categoria="sistema">
      <div className="flex h-full flex-col gap-3 p-3" data-testid="director-pendientes">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div>
            <p className="text-xl font-black text-foreground/90">{pendientes.listas}</p>
            <p className="text-[10px] text-muted-foreground/70">listas</p>
          </div>
          <div>
            <p className="text-xl font-black text-foreground/90">{pendientes.bloqueadas.length}</p>
            <p className="text-[10px] text-muted-foreground/70">bloqueadas</p>
          </div>
          <div>
            <p className="text-xl font-black text-foreground/90">{pendientes.sinCambios}</p>
            <p className="text-[10px] text-muted-foreground/70">sin cambios</p>
          </div>
          <div>
            <p className="text-xl font-black text-rose-400">{pendientes.fallos}</p>
            <p className="text-[10px] text-muted-foreground/70">fallos</p>
          </div>
          <div>
            <p className="text-xl font-black text-foreground/90">{pendientes.esperandoAprobacion}</p>
            <p className="text-[10px] text-muted-foreground/70">aprobación</p>
          </div>
          <div>
            <p className="text-xl font-black text-emerald-400">{pendientes.integradasHoy}</p>
            <p className="text-[10px] text-muted-foreground/70">integradas hoy</p>
          </div>
        </div>

        {pendientes.bloqueadas.length > 0 ? (
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
            <p className="text-xs font-semibold text-foreground/80">Bloqueadas</p>
            <ul className="flex flex-col gap-1">
              {pendientes.bloqueadas.map((b) => <FilaBloqueada key={b.id} bloqueada={b} />)}
            </ul>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/60">nada bloqueado</p>
        )}

        {pendientes.fallosDetalle.length > 0 ? (
          <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
            <p className="text-xs font-semibold text-foreground/80">Fallos</p>
            <ul className="flex flex-col gap-1.5">
              {pendientes.fallosDetalle.map((f) => <FilaFallo key={f.id} fallo={f} />)}
            </ul>
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground/60">ningún fallo</p>
        )}
      </div>
    </MarcoWidget>
  );
}
