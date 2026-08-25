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
 *
 * CIERRE DE DEUDA — sincronizar de verdad, y añadir/quitar cerebros: antes
 * no había endpoint para "sincronizar ahora" y por eso no había botón — era
 * lo correcto, un botón sin backend detrás miente. Ahora existen los tres
 * (`syncGenesisCerebros` todos · `syncGenesisSerCerebro` uno ·
 * `deleteGenesisSerCerebro`), y viven aquí con `target`/`serId` OPCIONALES:
 * presentes ⇒ el panel habla solo con el backend; ausentes ⇒ se comporta
 * EXACTAMENTE como antes (edición y "quitar" locales vía `onCommit`, que el
 * padre persiste con el endpoint de siempre) — así un montaje que todavía
 * no los pasa no se rompe ni pierde nada.
 *
 * El contexto que esto tiene que reflejar tal cual: el sync con R2 está
 * roto de verdad (handshake TLS) y el backend cae a Supabase — así que un
 * "sincronizar ahora" que sale bien puede convivir con una vía rota por
 * detrás. `ViasBadges` enseña cada vía por separado (icono + palabra, nunca
 * solo color) precisamente para que un resultado global en verde no
 * esconda esa mitad rota — ni en el botón de "todos" ni en el de "uno".
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle, Brain, CircleCheck, Clock, RefreshCw, Trash2, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CerebroSer, ResultadoSincronizacion, ViaSincronizacion } from "@/lib/astraura/genesis-types";
import { deleteGenesisSerCerebro, syncGenesisCerebros, syncGenesisSerCerebro, type GenesisTarget } from "@/lib/astraura/genesis-client-ola2";
import { Switch } from "@/components/ui/switch";
import { BTN, BTN_DANGER, Badge, BusyIcon, Empty, Field, INPUT, MONO, SUB, fmtTs, useBusy } from "../../s158/shared";
import {
  cerebrosPropiosSeguros, conCerebroActualizado, estadoSyncTono, resumenSyncCerebro, resumirCerebros, resumirVias, sinCerebro,
  type EstadoSyncCerebro,
} from "./herramientas-logic";

const ICONO_ESTADO: Record<EstadoSyncCerebro, LucideIcon> = { ok: CircleCheck, fallo: AlertTriangle, nunca: Clock };

/** Cada vía, por separado — icono Y palabra, nunca solo color; un `ok` global nunca escondió una vía rota. */
function ViasBadges({ vias }: { vias: readonly ViaSincronizacion[] }) {
  if (vias.length === 0) return null;
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {vias.map((v, i) => (
          <Badge
            key={`${v.medio}-${i}`}
            tone={v.ok ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-rose-400/40 bg-rose-500/15 text-rose-100"}
            className="gap-1"
          >
            {v.ok ? <CircleCheck className="h-2.5 w-2.5 shrink-0" aria-hidden="true" /> : <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
            {v.medio}: {v.ok ? "ok" : "fallo"}
          </Badge>
        ))}
      </div>
      {vias.filter((v) => !v.ok).map((v, i) => (
        <p key={`${v.medio}-err-${i}`} className="text-[10px] leading-snug text-rose-200/75">
          {v.medio}: {v.error ?? "falló, pero el backend no dio detalle."}
        </p>
      ))}
    </div>
  );
}

function CerebroRow({
  c,
  disabled,
  sincronizando,
  quitando,
  onCambiar,
  onQuitar,
  onSincronizar,
}: {
  c: CerebroSer;
  disabled?: boolean;
  /** Este cerebro concreto tiene una sincronización en curso — para el spinner de SU botón, no de todos. */
  sincronizando?: boolean;
  quitando?: boolean;
  onCambiar: (cambios: Partial<CerebroSer>) => void;
  onQuitar: () => void;
  /** Ausente cuando el panel no tiene `target`+`serId` (ver cabecera del fichero): sin backend al que llamar, no se ofrece el botón. */
  onSincronizar?: () => void;
}) {
  const sync = resumenSyncCerebro(c);
  const IconoEstado = ICONO_ESTADO[sync.estado];
  const vias = resumirVias(c.vias);

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
        {onSincronizar && (
          <button
            type="button"
            className={cn(BTN, "px-1.5 py-0.5")}
            disabled={disabled}
            onClick={onSincronizar}
            aria-label={`Sincronizar ahora el cerebro ${c.nombre}`}
          >
            <BusyIcon busy={Boolean(sincronizando)} icon={RefreshCw} /> Sincronizar
          </button>
        )}
        <button
          type="button"
          className={cn(BTN_DANGER, "ml-auto px-1.5 py-0.5")}
          disabled={disabled}
          onClick={onQuitar}
          aria-label={`Quitar el cerebro ${c.nombre}`}
        >
          <BusyIcon busy={Boolean(quitando)} icon={Trash2} />
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

      {/* Desglose por vía del ÚLTIMO intento — SIEMPRE visible si el backend lo mandó, sin importar si `estado` de arriba
          ya dice "ok". Es justo el caso de hoy: Supabase salva el resultado global mientras R2 sigue roto por detrás;
          esconder esto aquí sería el mismo "check verde que miente" que ya se corrigió en `estadoSyncEfectivo`. */}
      {vias.vias.length > 0 && (
        <div className="space-y-1 border-t border-white/10 pt-1.5">
          <p className={MONO}>vía por vía del último intento</p>
          {sync.estado === "ok" && vias.algunaFalla && (
            <p className="text-[10px] leading-snug text-amber-200/85">Sincronizado en conjunto, pero al menos una vía real sigue fallando por detrás — no es un fallo total, pero tampoco todo funciona.</p>
          )}
          <ViasBadges vias={vias.vias} />
        </div>
      )}
    </div>
  );
}

export interface CerebrosPanelProps {
  value: CerebroSer[] | null | undefined;
  onCommit: (next: CerebroSer[]) => void;
  disabled?: boolean;
  /**
   * Con `target` el panel puede sincronizar TODOS los cerebros del sistema
   * (botón de cabecera). Con `target`+`serId` además puede sincronizar o
   * quitar UN cerebro por su cuenta, contra los endpoints dedicados —
   * ver la cabecera del fichero. Ambos opcionales: sin ellos, el panel se
   * comporta exactamente como antes de este cierre de deudas.
   */
  target?: GenesisTarget;
  serId?: string;
}

export function CerebrosPanel({ value, onCommit, disabled, target, serId }: CerebrosPanelProps) {
  const lista = Array.isArray(value) ? value : [];
  const resumen = resumirCerebros(lista);
  const { busy, wrap } = useBusy();
  const [resultadoGlobal, setResultadoGlobal] = useState<ResultadoSincronizacion | null>(null);
  const disabledTotal = disabled || busy !== "";

  function sincronizarTodos() {
    if (!target) return; // defensivo: el botón que llama a esto no se pinta sin `target`
    void wrap("sync:todos", async () => {
      const r = await syncGenesisCerebros(target);
      if (!r.ok) { toast.error("No se pudieron sincronizar los cerebros del sistema", { description: r.error }); return; }
      setResultadoGlobal(r.data);
      const v = resumirVias(r.data.vias);
      const n = r.data.cerebrosTocados;
      const detalle = `${n} cerebro${n === 1 ? "" : "s"} tocado${n === 1 ? "" : "s"}${v.texto ? ` · ${v.texto}` : ""}`;
      if (v.algunaFalla) toast.warning("Sincronización global con al menos una vía rota", { description: detalle });
      else toast.success("Todos los cerebros del sistema, sincronizados", { description: detalle });
    });
  }

  function sincronizarUno(c: CerebroSer) {
    if (!target || !serId) return; // defensivo: el botón de la fila no se pinta sin los dos
    void wrap(`sync:${c.id}`, async () => {
      const r = await syncGenesisSerCerebro(target, serId, c.id);
      if (!r.ok) { toast.error(`No se pudo sincronizar «${c.nombre}»`, { description: r.error }); return; }
      const siguiente = cerebrosPropiosSeguros(r.data);
      onCommit(siguiente); // el ser vuelve con el resultado REAL de este intento (estado, error, vías) — se refleja tal cual
      const actualizado = siguiente.find((x) => x.id === c.id);
      const v = resumirVias(actualizado?.vias);
      const estadoReal = actualizado ? resumenSyncCerebro(actualizado) : null;
      if (estadoReal?.estado === "fallo") toast.error(`«${c.nombre}»: sincronización fallida`, { description: v.texto || estadoReal.error || undefined });
      else if (v.algunaFalla) toast.warning(`«${c.nombre}» sincronizado, con una vía rota por detrás`, { description: v.texto });
      else toast.success(`«${c.nombre}» sincronizado`);
    });
  }

  function quitar(c: CerebroSer) {
    if (target && serId) {
      void wrap(`quitar:${c.id}`, async () => {
        const r = await deleteGenesisSerCerebro(target, serId, c.id);
        if (!r.ok) { toast.error(`No se pudo quitar «${c.nombre}»`, { description: r.error }); return; } // si falla, NO se quita de la vista: nunca un "quitado" que el backend no confirmó
        onCommit(sinCerebro(lista, c.id));
        toast.success(`«${c.nombre}» quitado`);
      });
      return;
    }
    onCommit(sinCerebro(lista, c.id)); // sin endpoint dedicado a mano: el mecanismo de siempre (el padre persiste el array completo)
  }

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

      {/* Sincronizar TODOS — global de verdad, no solo los de este ser; se dice explícitamente para que no parezca un alcance distinto del real. */}
      {target && (
        <div className={cn(SUB, "flex flex-wrap items-start justify-between gap-2 px-3 py-2")}>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-white/80">Sincronizar TODOS los cerebros del sistema</p>
            <p className="mt-0.5 text-[10px] leading-snug text-white/50">No solo los de este ser. Cada vía real (hoy: R2 y Supabase) se enseña por separado, funcione o no.</p>
            {resultadoGlobal && (
              <div className="mt-1.5 space-y-1">
                <ViasBadges vias={resumirVias(resultadoGlobal.vias).vias} />
                <p className="text-[10px] text-white/40">
                  {resultadoGlobal.cerebrosTocados} cerebro{resultadoGlobal.cerebrosTocados === 1 ? "" : "s"} tocado{resultadoGlobal.cerebrosTocados === 1 ? "" : "s"} · {fmtTs(resultadoGlobal.en) || "fecha desconocida"}
                </p>
              </div>
            )}
          </div>
          <button type="button" className={cn(BTN, "shrink-0")} disabled={disabledTotal} onClick={sincronizarTodos} aria-label="Sincronizar ahora todos los cerebros del sistema">
            <BusyIcon busy={busy === "sync:todos"} icon={RefreshCw} /> Sincronizar todos
          </button>
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
              disabled={disabledTotal}
              sincronizando={busy === `sync:${c.id}`}
              quitando={busy === `quitar:${c.id}`}
              onCambiar={(cambios) => onCommit(conCerebroActualizado(lista, c.id, cambios))}
              onQuitar={() => quitar(c)}
              onSincronizar={target && serId ? () => sincronizarUno(c) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default CerebrosPanel;
