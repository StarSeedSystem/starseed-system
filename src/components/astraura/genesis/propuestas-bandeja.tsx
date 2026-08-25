"use client";

/**
 * propuestas-bandeja.tsx — la bandeja de propuestas (punto 6 del encargo).
 *
 * "La bandeja de trabajo que los seres hicieron fuera de su dominio, con su
 * rama variante y su diff, y los botones de aceptar/descartar. Es el sitio
 * donde Alex ejerce el sí y el no."
 *
 * Las pendientes se enseñan SIEMPRE completas — a diferencia de otras listas
 * del OS que truncan tras N elementos, aquí truncar sería esconder una
 * decisión que espera. Lo ya decidido (aceptada/descartada) vive detrás de
 * un botón "ver historial", porque ya no reclama atención.
 *
 * Aceptar y descartar son acciones directas, sin diálogo de confirmación —
 * mismo criterio que "aplicar"/"descartar" sobre una rama en
 * `imaginacion-tab.tsx` (BranchCard): decidir sí/no ES la acción, no un
 * paso previo a confirmar. `useConfirm()` se reserva para lo destructivo
 * fuera de este flujo (p. ej. borrar un ser entero, en `ser-ficha.tsx`).
 */
import { useState } from "react";
import { Check, FileDiff, GitBranch, Inbox, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Propuesta, SerListado } from "@/lib/astraura/genesis-types";
import {
  acceptGenesisPropuesta,
  discardGenesisPropuesta,
  fetchGenesisPropuestas,
  fetchGenesisSeres,
  type GenesisTarget,
} from "@/lib/astraura/genesis-client";
import { Badge, BTN, BTN_DANGER, BTN_PRIMARY, BusyIcon, CARD, Empty, fmtAgo, MONO, SectionTitle, SUB, useBusy, useS158Load } from "../s158/shared";
import { nombrePorId, propuestasPendientes, resumirCambiosPropuesta } from "./genesis-logic";

/** Clasifica una línea de diff unificado para pintarla — no hace falta librería de sintaxis. */
function tonoLineaDiff(linea: string): string {
  if (linea.startsWith("+") && !linea.startsWith("+++")) return "text-emerald-300";
  if (linea.startsWith("-") && !linea.startsWith("---")) return "text-rose-300";
  if (linea.startsWith("@@")) return "text-cyan-300/80";
  return "text-white/50";
}

function PropuestaCard({
  p,
  nombreSer,
  busy,
  onAceptar,
  onDescartar,
  onAbrirSer,
}: {
  p: Propuesta;
  nombreSer: string;
  busy: string;
  onAceptar: (p: Propuesta) => void;
  onDescartar: (p: Propuesta) => void;
  onAbrirSer?: () => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const resumen = resumirCambiosPropuesta(p);
  const cambios = Array.isArray(p.cambios) ? p.cambios : []; // backend viejo/roto: nunca reventar el .map
  const pendiente = p.estado === "pendiente";
  const aceptada = p.estado === "aceptada";
  const titulo = p.titulo || "(propuesta sin título)";

  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2", !pendiente && "opacity-70")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90" title={titulo}>{titulo}</p>
        <Badge
          tone={
            aceptada
              ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
              : pendiente
                ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
                : "border-white/15 bg-white/[0.04] text-white/50"
          }
        >
          {p.estado || "—"}
        </Badge>
      </div>

      {p.descripcion && <p className="text-[10px] leading-snug text-white/65">{p.descripcion}</p>}

      <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-white/50">
        {onAbrirSer ? (
          <button type="button" className="underline decoration-dotted underline-offset-2 hover:text-cyan-200" onClick={onAbrirSer} aria-label={`Abrir la ficha de ${nombreSer}`}>
            {nombreSer}
          </button>
        ) : (
          <span>{nombreSer}</span>
        )}
        <span aria-hidden="true">·</span>
        <span className="inline-flex items-center gap-1"><GitBranch className="h-3 w-3 shrink-0" aria-hidden="true" /> {p.rama || "(sin rama)"}</span>
        <span aria-hidden="true">·</span>
        <span>{fmtAgo(p.creadaEn)}</span>
      </div>

      <button
        type="button"
        className="flex items-center gap-1.5 text-left text-[10px] text-white/55 transition-colors hover:text-cyan-200"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        disabled={cambios.length === 0}
      >
        <FileDiff className="h-3 w-3 shrink-0" aria-hidden="true" />
        {resumen.archivos === 0
          ? "Sin cambios de fichero registrados"
          : `${resumen.archivos} ${resumen.archivos === 1 ? "fichero" : "ficheros"} · ${resumen.lineasTotales} líneas${resumen.conDiff ? ` · ${resumen.conDiff} con diff` : ""}`}
      </button>

      {abierta && cambios.length > 0 && (
        <div className="space-y-1.5">
          {cambios.map((c, i) => (
            <div key={`${c.ruta}-${i}`} className="space-y-1">
              <p className={MONO}>{c.ruta || "(ruta desconocida)"}{typeof c.lineas === "number" ? ` · ${c.lineas} líneas` : ""}</p>
              {c.diff ? (
                <div className="max-h-64 overflow-auto rounded-md border border-white/10 bg-black/40 p-2 font-code text-[10px] leading-snug">
                  {c.diff.split(/\r?\n/).map((linea, li) => (
                    <div key={li} className={cn("whitespace-pre", tonoLineaDiff(linea))}>{linea || " "}</div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-white/35">Sin diff de texto para este fichero.</p>
              )}
            </div>
          ))}
        </div>
      )}

      {pendiente && (
        <div className="mt-1 flex gap-1.5">
          <button type="button" className={BTN_PRIMARY} disabled={busy !== ""} onClick={() => onAceptar(p)} aria-label={`Aceptar la propuesta ${titulo}`}>
            <BusyIcon busy={busy === `aceptar:${p.id}`} icon={Check} /> Aceptar
          </button>
          <button type="button" className={BTN_DANGER} disabled={busy !== ""} onClick={() => onDescartar(p)} aria-label={`Descartar la propuesta ${titulo}`}>
            <BusyIcon busy={busy === `descartar:${p.id}`} icon={X} /> Descartar
          </button>
        </div>
      )}
    </div>
  );
}

export interface PropuestasBandejaProps {
  target: GenesisTarget;
  /** Navega a la ficha del ser autor cuando lo dan; sin él, el nombre se enseña como texto plano. */
  onAbrirSer?: (serId: string) => void;
}

export function PropuestasBandeja({ target, onAbrirSer }: PropuestasBandejaProps) {
  const propuestas = useS158Load(fetchGenesisPropuestas, target, 20_000);
  const seresQ = useS158Load(fetchGenesisSeres, target, 60_000);
  const { busy, wrap } = useBusy();
  const [verHistorial, setVerHistorial] = useState(false);

  const todas = propuestas.data ?? [];
  const seres: SerListado[] = seresQ.data ?? [];
  const pendientes = propuestasPendientes(todas);
  const resueltas = todas.filter((p) => p.estado !== "pendiente");

  function aceptar(p: Propuesta) {
    void wrap(`aceptar:${p.id}`, async () => {
      const r = await acceptGenesisPropuesta(target, p.id);
      if (!r.ok) { toast.error(`No se pudo aceptar "${p.titulo}"`, { description: r.error }); return; }
      toast.success(`Aceptada: ${p.titulo}`, { description: p.rama });
      await propuestas.reload(true);
    });
  }

  function descartar(p: Propuesta) {
    void wrap(`descartar:${p.id}`, async () => {
      const r = await discardGenesisPropuesta(target, p.id);
      if (!r.ok) { toast.error(`No se pudo descartar "${p.titulo}"`, { description: r.error }); return; }
      toast.message(`Descartada: ${p.titulo}`, { description: p.rama });
      await propuestas.reload(true);
    });
  }

  return (
    <div className={cn(CARD, "p-3")}>
      <SectionTitle
        icon={Inbox}
        title={`Propuestas (${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"})`}
        hint="El sitio donde ejerces el sí y el no: lo que tus seres quisieron cambiar fuera de su dominio, cada cambio con su rama variante y su diff, esperando tu decisión."
        tone="text-amber-300"
        right={
          resueltas.length > 0 ? (
            <button type="button" className={BTN} onClick={() => setVerHistorial((v) => !v)} aria-expanded={verHistorial}>
              {verHistorial ? "Ocultar historial" : `Ver historial (${resueltas.length})`}
            </button>
          ) : undefined
        }
      />

      <div className="mt-2 space-y-1.5">
        {todas.length === 0 && (
          <Empty
            loading={propuestas.loading}
            error={propuestas.error}
            text="Todavía no hay ninguna propuesta: cuando un ser quiera cambiar algo fuera de su dominio, aparecerá aquí en espera de tu sí o tu no."
          />
        )}
        {todas.length > 0 && pendientes.length === 0 && !verHistorial && (
          <p className="text-[11px] text-white/50">Sin propuestas pendientes ahora mismo — todo lo demás ya fue decidido.</p>
        )}

        {pendientes.map((p) => (
          <PropuestaCard
            key={p.id}
            p={p}
            nombreSer={nombrePorId(p.serId, seres)}
            busy={busy}
            onAceptar={aceptar}
            onDescartar={descartar}
            onAbrirSer={onAbrirSer ? () => onAbrirSer(p.serId) : undefined}
          />
        ))}

        {verHistorial &&
          resueltas.map((p) => (
            <PropuestaCard
              key={p.id}
              p={p}
              nombreSer={nombrePorId(p.serId, seres)}
              busy={busy}
              onAceptar={aceptar}
              onDescartar={descartar}
              onAbrirSer={onAbrirSer ? () => onAbrirSer(p.serId) : undefined}
            />
          ))}
      </div>
    </div>
  );
}

export default PropuestasBandeja;
