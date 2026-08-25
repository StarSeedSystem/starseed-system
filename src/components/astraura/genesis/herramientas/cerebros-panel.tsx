"use client";

/**
 * cerebros-panel.tsx — `CerebroSer[]`, los cerebros propios de un ser (punto
 * 4 del encargo de OLA 2).
 *
 * Alex, literal: "memorias en cerebros propios configurables y enrutables y
 * sincronizables". Cada fila enseña nombre, ruta de almacén, a dónde se
 * enruta, si se sincroniza, y — lo que de verdad importa hoy — cuándo fue la
 * última sincronización y CON QUÉ RESULTADO.
 *
 * AVISO que este panel refleja a propósito: el sync con Cloudflare R2 está
 * roto de verdad (handshake TLS) y hasta ayer el sistema decía "sincronizado
 * correctamente" mientras fallaba. Por eso `estadoSync` nunca se adivina en
 * positivo: `estadoSyncEfectivo` (en `herramientas-logic.ts`) trata CUALQUIER
 * cosa que no sea literalmente "ok"/"fallo" como "nunca", y un "fallo" enseña
 * siempre `errorSync` real — nunca un check verde que no se ha ganado. Los
 * tres estados usan icono Y palabra distintos, nunca solo color.
 *
 * `ultimaSync`/`estadoSync`/`errorSync` son SOLO LECTURA a propósito: son el
 * resultado de un intento real que hizo el backend, no algo que la interfaz
 * deba poder fingir. Lo editable es justo lo que Alex pidió como
 * "configurable": nombre, ruta, enrutado y si debe sincronizarse.
 *
 * Edición: mismo criterio no controlado que el resto de paneles de ficha
 * (`defaultValue`/`onBlur`) — el padre debe montar este panel con
 * `key={ser.id}` (y cada fila ya usa `key={c.id}`) para que cambiar de ser
 * reinicie los campos al ser nuevo.
 */
import { AlertTriangle, Brain, CircleCheck, Clock, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CerebroSer } from "@/lib/astraura/genesis-types";
import { Switch } from "@/components/ui/switch";
import { BTN_DANGER, Badge, Empty, Field, INPUT, SUB, fmtTs } from "../../s158/shared";
import { conCerebroActualizado, estadoSyncTono, resumenSyncCerebro, resumirCerebros, sinCerebro, type EstadoSyncCerebro } from "./herramientas-logic";

const ICONO_ESTADO: Record<EstadoSyncCerebro, LucideIcon> = { ok: CircleCheck, fallo: AlertTriangle, nunca: Clock };

function CerebroRow({
  c,
  disabled,
  onCambiar,
  onQuitar,
}: {
  c: CerebroSer;
  disabled?: boolean;
  onCambiar: (cambios: Partial<CerebroSer>) => void;
  onQuitar: () => void;
}) {
  const sync = resumenSyncCerebro(c);
  const IconoEstado = ICONO_ESTADO[sync.estado];

  return (
    <div className={cn(SUB, "space-y-2 px-3 py-2")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Brain className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden="true" />
        <input
          className={cn(INPUT, "min-w-[9rem] flex-1 font-sans text-[12px] font-medium")}
          defaultValue={c.nombre}
          disabled={disabled}
          aria-label={`Nombre del cerebro ${c.nombre}`}
          onBlur={(e) => { const v = e.target.value.trim() || c.nombre; if (v !== c.nombre) onCambiar({ nombre: v }); }}
        />
        {/* Estado de sync: SOLO LECTURA — nunca un check que la interfaz no se ganó. Icono + palabra, nunca solo color. */}
        <Badge tone={estadoSyncTono(sync.estado)} className="gap-1">
          <IconoEstado className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /> {sync.etiqueta}
        </Badge>
        <button
          type="button"
          className={cn(BTN_DANGER, "ml-auto px-1.5 py-0.5")}
          disabled={disabled}
          onClick={onQuitar}
          aria-label={`Quitar el cerebro ${c.nombre}`}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Ruta de almacén" hint="Dónde vive físicamente.">
          <input
            className={INPUT}
            defaultValue={c.rutaAlmacen ?? ""}
            placeholder="sin ruta asignada"
            disabled={disabled}
            aria-label={`Ruta de almacén de ${c.nombre}`}
            onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (c.rutaAlmacen ?? null)) onCambiar({ rutaAlmacen: v }); }}
          />
        </Field>
        <Field label="Enrutado a" hint="Medio o servidor al que se enruta (R2, disco externo, otro nodo).">
          <input
            className={INPUT}
            defaultValue={c.enrutadoA ?? ""}
            placeholder="sin destino de enrutado"
            disabled={disabled}
            aria-label={`A dónde se enruta ${c.nombre}`}
            onBlur={(e) => { const v = e.target.value.trim() || null; if (v !== (c.enrutadoA ?? null)) onCambiar({ enrutadoA: v }); }}
          />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] text-white/80">
          <Switch
            checked={c.sincronizable}
            disabled={disabled}
            aria-label={`${c.nombre} es sincronizable`}
            onCheckedChange={(v) => onCambiar({ sincronizable: v })}
          />
          sincronizable
        </label>
        <p className="text-[10px] text-white/45">
          {sync.estado === "nunca" ? "Sin fecha registrada: nunca se ha intentado sincronizar." : `Último intento: ${fmtTs(c.ultimaSync) || "fecha desconocida"}.`}
        </p>
      </div>

      {/* El fallo real, si lo hay, siempre visible — el caso de hoy es literalmente este: R2 roto por handshake TLS. */}
      {sync.error && (
        <p className="flex items-start gap-1.5 text-[10px] leading-snug text-rose-200/85" role="alert">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> {sync.error}
        </p>
      )}
    </div>
  );
}

export interface CerebrosPanelProps {
  value: CerebroSer[] | null | undefined;
  onCommit: (next: CerebroSer[]) => void;
  disabled?: boolean;
}

export function CerebrosPanel({ value, onCommit, disabled }: CerebrosPanelProps) {
  const lista = Array.isArray(value) ? value : [];
  const resumen = resumirCerebros(lista);

  return (
    <div className="space-y-2">
      {/* Resumen de la verdad de sincronización, delante — mismo criterio que el banner de `enrutado-panel.tsx`: nunca un check que no se ha ganado. */}
      {lista.length > 0 && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2",
            resumen.fallo > 0 ? "border-rose-400/40 bg-rose-500/[0.08]" : "border-white/10 bg-black/20",
          )}
          role={resumen.fallo > 0 ? "alert" : undefined}
        >
          {resumen.fallo > 0 ? (
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
          ) : (
            <Brain className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden="true" />
          )}
          <p className={cn("text-[12px] font-medium", resumen.fallo > 0 ? "text-rose-100" : "text-white/85")}>
            {resumen.ok} sincronizado{resumen.ok === 1 ? "" : "s"} · {resumen.fallo} con fallo · {resumen.nunca} nunca sincronizado{resumen.nunca === 1 ? "" : "s"}.
          </p>
        </div>
      )}

      {lista.length === 0 ? (
        <Empty text="Este ser todavía no tiene cerebros propios configurados." />
      ) : (
        <div className="space-y-1.5">
          {lista.map((c) => (
            <CerebroRow
              key={c.id}
              c={c}
              disabled={disabled}
              onCambiar={(cambios) => onCommit(conCerebroActualizado(lista, c.id, cambios))}
              onQuitar={() => onCommit(sinCerebro(lista, c.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CerebrosPanel;
