"use client";

/**
 * enrutado-panel.tsx — los modelos, con la verdad delante (punto 4 del
 * encargo).
 *
 * La escalera de `EnrutadoCognitivo` va del más barato al más capaz; Alex
 * quiere que sus seres piensen con modelos GRATUITOS. Este panel:
 *   · dice qué modelo atendió la última vez, y sobre todo,
 *   · muestra `ultimaFueDegradada` sin adornos cuando la respuesta salió de
 *     plantilla en vez de un modelo real (banner ámbar, no una insignia
 *     bonita escondida),
 *   · deja verificar un modelo DE VERDAD (`POST /api/genesis/modelos/verificar`)
 *     con su latencia y una muestra real de lo que contestó.
 * Este proyecto lleva semanas quitando plantillas disfrazadas de
 * pensamiento — este panel existe para que Génesis no reincida.
 */
import { useState } from "react";
import { AlertTriangle, CircleCheck, CircleHelp, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { EnrutadoCognitivo, ModeloDisponible, VerificacionModelo } from "@/lib/astraura/genesis-types";
import { verifyGenesisModelo, type GenesisTarget } from "@/lib/astraura/genesis-client";
import { Switch } from "@/components/ui/switch";
import { Badge, BTN, BusyIcon, Empty, Field, MONO, SUB, TEXTAREA, fmtTs, useBusy } from "../s158/shared";
import { costeLabel, describirEnrutado, escaleraConCatalogo, fmtLatencia, joinLineList, parseLineList } from "./genesis-logic";

export interface EnrutadoPanelProps {
  target: GenesisTarget;
  value: EnrutadoCognitivo;
  catalogo: ModeloDisponible[];
  catalogoLoading?: boolean;
  catalogoError?: string;
  onCommit: (patch: Partial<EnrutadoCognitivo>) => void;
  disabled?: boolean;
}

function PeldanoRow({
  peldano,
  verificando,
  resultado,
  onVerificar,
}: {
  peldano: ReturnType<typeof escaleraConCatalogo>[number];
  verificando: boolean;
  resultado?: VerificacionModelo;
  onVerificar: (id: string) => void;
}) {
  const gratis = (peldano.catalogo?.costePorMillon ?? 0) <= 0;
  return (
    <div className={cn(SUB, "flex flex-col gap-1 px-3 py-2")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-code text-[10px] text-white/40">#{peldano.posicion + 1}</span>
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{peldano.catalogo?.etiqueta ?? peldano.id}</p>
        {peldano.esUltimoUsado && <Badge tone="border-cyan-400/40 bg-cyan-500/15 text-cyan-100">último usado</Badge>}
        <Badge tone={gratis ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100" : "border-amber-400/30 bg-amber-500/10 text-amber-100"}>
          {costeLabel(peldano.catalogo?.costePorMillon)}
        </Badge>
        <button type="button" className={BTN} disabled={verificando} onClick={() => onVerificar(peldano.id)} aria-label={`Verificar ${peldano.id} de verdad, con una llamada real`}>
          <BusyIcon busy={verificando} icon={ShieldCheck} /> Verificar de verdad
        </button>
      </div>
      <p className={MONO}>
        {peldano.id}
        {peldano.catalogo ? ` · ${peldano.catalogo.proveedor}${peldano.catalogo.contexto ? ` · ${peldano.catalogo.contexto.toLocaleString("es")} tokens de contexto` : ""}` : " · fuera del catálogo actual — puede que ya no exista"}
        {peldano.catalogo?.verificadoEn ? ` · última verificación conocida ${fmtTs(peldano.catalogo.verificadoEn)}` : ""}
      </p>
      {resultado && (
        <p className={cn("flex items-start gap-1.5 text-[10px] leading-snug", resultado.responde ? "text-emerald-200/90" : "text-rose-200/90")}>
          {resultado.responde ? <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}
          {resultado.responde
            ? <span>Respondió de verdad en {fmtLatencia(resultado.latenciaMs)}{resultado.muestra ? ` — "${resultado.muestra.slice(0, 100)}${resultado.muestra.length > 100 ? "…" : ""}"` : " (sin muestra de texto)"}</span>
            : <span>No respondió: {resultado.error ?? "el backend no dio más detalle"}.</span>}
        </p>
      )}
    </div>
  );
}

export function EnrutadoPanel({ target, value, catalogo, catalogoLoading, catalogoError, onCommit, disabled }: EnrutadoPanelProps) {
  const { busy, wrap } = useBusy();
  const [resultados, setResultados] = useState<Record<string, VerificacionModelo>>({});
  const info = describirEnrutado(value);
  const peldanos = escaleraConCatalogo(value, catalogo);

  function verificar(modeloId: string) {
    void wrap(`verify:${modeloId}`, async () => {
      const r = await verifyGenesisModelo(target, modeloId);
      if (!r.ok) {
        toast.error(`No se pudo verificar ${modeloId}`, { description: r.error });
        return;
      }
      setResultados((prev) => ({ ...prev, [modeloId]: r.data }));
      if (r.data.responde) toast.success(`${modeloId} respondió de verdad`, { description: fmtLatencia(r.data.latenciaMs) });
      else toast.warning(`${modeloId} no respondió`, { description: r.data.error ?? "sin más detalle" });
    });
  }

  function commitEscalera(texto: string) {
    const siguiente = parseLineList(texto);
    if (JSON.stringify(siguiente) === JSON.stringify(value.escalera)) return;
    onCommit({ escalera: siguiente });
  }

  return (
    <div className="space-y-3">
      {/* La verdad delante, sin insignia bonita que la esconda. */}
      <div
        className={cn(
          "flex items-start gap-2 rounded-lg border px-3 py-2",
          info.degradada ? "border-amber-400/40 bg-amber-500/[0.08]" : "border-white/10 bg-black/20",
        )}
        role={info.degradada ? "alert" : undefined}
      >
        {info.degradada ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
        ) : info.ultimoUsado ? (
          <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
        ) : (
          <CircleHelp className="mt-0.5 h-4 w-4 shrink-0 text-white/40" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className={cn("text-[12px] font-medium", info.degradada ? "text-amber-100" : "text-white/85")}>{info.resumen}</p>
          {info.degradada && <p className="mt-0.5 text-[10px] text-amber-200/70">No hubo un modelo pensando de verdad: lo que salió fue una plantilla. Verifica un peldaño de abajo para confirmar cuál responde ahora mismo.</p>}
          {info.siguienteSiFalla && <p className="mt-0.5 text-[10px] text-white/45">Si el actual falla, el siguiente peldaño a intentar es <span className="text-white/70">{info.siguienteSiFalla}</span>.</p>}
        </div>
      </div>

      <label className="flex items-center gap-2 text-[11px] text-white/80">
        <Switch checked={value.soloGratuitos} disabled={disabled} aria-label="Nunca subir a un modelo de pago" onCheckedChange={(v) => onCommit({ soloGratuitos: v })} />
        Solo modelos gratuitos — nunca subir a uno de pago aunque toda la escalera falle
      </label>

      <Field label={`Escalera de modelos (${value.escalera.length}) — del más barato arriba al más capaz abajo`} hint="Un id de modelo por línea, en el orden en que se prueban.">
        <textarea
          className={cn(TEXTAREA, "min-h-[64px] font-code")}
          defaultValue={joinLineList(value.escalera)}
          disabled={disabled}
          aria-label="Escalera de modelos"
          onBlur={(e) => commitEscalera(e.target.value)}
        />
      </Field>

      {!catalogo.length && <Empty loading={catalogoLoading} error={catalogoError} text="El backend no expone un catálogo de modelos todavía — la escalera de arriba sigue funcionando, solo sin metadatos de coste." />}

      {peldanos.length === 0 ? (
        <p className="text-[11px] text-white/50">Sin peldaños todavía: escribe al menos un id de modelo arriba.</p>
      ) : (
        <div className="space-y-1.5">
          {peldanos.map((p) => (
            <PeldanoRow key={`${p.id}-${p.posicion}`} peldano={p} verificando={busy === `verify:${p.id}`} resultado={resultados[p.id]} onVerificar={verificar} />
          ))}
        </div>
      )}
    </div>
  );
}

export default EnrutadoPanel;
