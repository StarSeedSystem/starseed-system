"use client";

import React, { useState } from "react";
import {
  Brain,
  Layers,
  Network,
  Activity,
  Sparkles,
  Copy,
  Check,
  Terminal,
} from "lucide-react";
import {
  capasActivas,
  estadoAdaptador,
  resumirExperiencias,
  calibracion,
  type ResumenExperiencias,
  type EstadoAdaptadorInfo,
  type CapaActiva,
  type TramoCalibracion,
  type Experiencia,
} from "@/lib/mando/conciencia";

export interface PanelConcienciaProps {
  experiencias?: (string | Record<string, unknown>)[];
  experienciasObjetos?: Experiencia[];
  manifiesto?: unknown;
  estadoNeedle?: unknown;
  estadoBitnet?: unknown;
  estadoJev?: unknown;
  nodosInfo?: { total: number; porMotor: Record<string, number> };
}

export function PanelConciencia({
  experiencias = [],
  experienciasObjetos = [],
  manifiesto,
  estadoNeedle,
  estadoBitnet,
  estadoJev,
  nodosInfo,
}: PanelConcienciaProps) {
  const [copiado, setCopiado] = useState(false);
  const [mostrarComando, setMostrarComando] = useState(false);

  const resumen: ResumenExperiencias = resumirExperiencias(experiencias);
  const adaptador: EstadoAdaptadorInfo = estadoAdaptador(
    manifiesto,
    estadoNeedle
  );
  const capas: CapaActiva[] = capasActivas({
    needle: estadoNeedle,
    jev: estadoJev,
    bitnet: estadoBitnet,
  });

  const expsProcesadas: Experiencia[] =
    experienciasObjetos.length > 0
      ? experienciasObjetos
      : experiencias
          .map((e) => {
            if (typeof e === "string") {
              try {
                return JSON.parse(e) as Experiencia;
              } catch {
                return null;
              }
            }
            return e as Experiencia;
          })
          .filter((e): e is Experiencia => e !== null);

  const tramosJev: Record<string, TramoCalibracion> = calibracion(
    expsProcesadas,
    "jev"
  );

  const nodos = nodosInfo || {
    total: 2,
    porMotor: {
      "BitNet 1.58": 1,
      "Needle 3": 1,
    },
  };

  const pctResultado =
    resumen.total > 0
      ? Math.round((resumen.conResultado / resumen.total) * 100)
      : 0;

  const comandoEntrenamiento = "bash scripts/ciclo-aprendizaje-needle.sh";

  const copiarComando = async () => {
    try {
      await navigator.clipboard.writeText(comandoEntrenamiento);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback
    }
  };

  const colorPunto: Record<string, string> = {
    verde: "bg-emerald-500",
    ambar: "bg-amber-500",
    rojo: "bg-rose-500",
    gris: "bg-neutral-500",
  };

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/80 p-4 text-sm text-neutral-200 space-y-4">
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
        <Brain className="h-5 w-5 text-amber-400" />
        <h2 className="text-base font-semibold text-white">
          Conciencia colectiva
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Bloque 1: Capas activas */}
        <section className="rounded-lg border border-neutral-800 bg-black/30 p-3 space-y-2">
          <div className="flex items-center gap-2 font-medium text-xs text-neutral-400 uppercase tracking-wider">
            <Layers className="h-4 w-4 text-emerald-400" />
            <span>Capas de decisión</span>
          </div>
          <div className="space-y-2 pt-1">
            {capas.map((c) => (
              <div
                key={c.nombre}
                className="flex items-center justify-between text-xs rounded-md bg-neutral-800/40 px-2.5 py-1.5 border border-neutral-800"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      colorPunto[c.tono] || "bg-neutral-500"
                    }`}
                  />
                  <span className="font-semibold text-white">{c.nombre}</span>
                </div>
                <span className="text-neutral-400 font-mono text-[11px]">
                  {c.detalle}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Bloque 2: Nodos de CC2 */}
        <section className="rounded-lg border border-neutral-800 bg-black/30 p-3 space-y-2">
          <div className="flex items-center justify-between font-medium text-xs text-neutral-400 uppercase tracking-wider">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-sky-400" />
              <span>Nodos colectivos (CC2)</span>
            </div>
            <span className="font-mono text-sky-300 font-semibold text-xs">
              {nodos.total} nodos
            </span>
          </div>
          <div className="space-y-1.5 pt-1">
            {Object.entries(nodos.porMotor).map(([motor, cant]) => (
              <div
                key={motor}
                className="flex items-center justify-between text-xs rounded-md bg-neutral-800/40 px-2.5 py-1.5 border border-neutral-800"
              >
                <span className="text-neutral-300 font-medium">{motor}</span>
                <span className="font-mono text-neutral-400 font-semibold">
                  {cant} {cant === 1 ? "nodo" : "nodos"}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bloque 3: Experiencias y Calibración de Jev */}
      <section className="rounded-lg border border-neutral-800 bg-black/30 p-3 space-y-3">
        <div className="flex items-center justify-between border-b border-neutral-800/80 pb-2">
          <div className="flex items-center gap-2 font-medium text-xs text-neutral-400 uppercase tracking-wider">
            <Activity className="h-4 w-4 text-purple-400" />
            <span>Experiencias y Calibración Jev</span>
          </div>
          <div className="flex gap-3 text-xs font-mono">
            <span className="text-neutral-300">
              Total: <strong className="text-white">{resumen.total}</strong>
            </span>
            <span className="text-neutral-300">
              Con resultado:{" "}
              <strong className="text-purple-300">{pctResultado}%</strong>
            </span>
          </div>
        </div>

        {/* Gráfico de barras simple por décimas de confianza */}
        <div className="space-y-1.5">
          <span className="text-[11px] font-medium text-neutral-400">
            Calibración Jev (% aciertos por décimas de confianza)
          </span>
          <div className="grid grid-cols-11 gap-1 items-end h-16 bg-neutral-950/60 p-2 rounded-md border border-neutral-800/60">
            {["0.0", "0.1", "0.2", "0.3", "0.4", "0.5", "0.6", "0.7", "0.8", "0.9", "1.0"].map(
              (dec) => {
                const tr = tramosJev[dec] || { n: 0, aciertos: 0 };
                const pct = tr.n > 0 ? Math.round((tr.aciertos / tr.n) * 100) : 0;
                const hPct = tr.n > 0 ? Math.max(15, pct) : 4;
                const barColor =
                  tr.n === 0
                    ? "bg-neutral-800"
                    : pct >= 75
                    ? "bg-emerald-500"
                    : pct >= 50
                    ? "bg-amber-500"
                    : "bg-rose-500";

                return (
                  <div
                    key={dec}
                    className="flex flex-col items-center justify-end h-full gap-1 group relative"
                  >
                    <div
                      style={{ height: `${hPct}%` }}
                      className={`w-full rounded-xs transition-all ${barColor}`}
                      title={`Confianza ${dec}: ${tr.aciertos}/${tr.n} aciertos (${pct}%)`}
                    />
                    <span className="text-[9px] font-mono text-neutral-500">
                      {dec}
                    </span>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </section>

      {/* Bloque 4: Adaptador colectivo */}
      <section className="rounded-lg border border-neutral-800 bg-black/30 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-medium text-xs text-neutral-400 uppercase tracking-wider">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span>Adaptador colectivo</span>
          </div>
          <button
            onClick={() => setMostrarComando(!mostrarComando)}
            className="cursor-pointer rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            Entrenar esta noche
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
          <div className="rounded-md bg-neutral-800/40 p-2 border border-neutral-800">
            <span className="text-neutral-500 block text-[10px]">SHA</span>
            <span className="font-semibold text-white">{adaptador.sha}</span>
          </div>
          <div className="rounded-md bg-neutral-800/40 p-2 border border-neutral-800">
            <span className="text-neutral-500 block text-[10px]">Fecha</span>
            <span className="font-semibold text-neutral-300">
              {adaptador.fecha}
            </span>
          </div>
          <div className="rounded-md bg-neutral-800/40 p-2 border border-neutral-800">
            <span className="text-neutral-500 block text-[10px]">Experiencias</span>
            <span className="font-semibold text-purple-300">
              {adaptador.experiencias}
            </span>
          </div>
          <div className="rounded-md bg-amber-950/30 p-2 border border-amber-800/40">
            <span className="text-amber-400/80 block text-[10px]">
              Exactitud Dorado
            </span>
            <span className="font-semibold text-amber-300">
              {typeof adaptador.exactitud === "number"
                ? `${adaptador.exactitud}%`
                : "—"}
            </span>
          </div>
        </div>

        {mostrarComando && (
          <div className="mt-2 rounded-md bg-neutral-950 border border-neutral-800 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <Terminal className="h-3.5 w-3.5 text-amber-400" />
                <span>Comando de entrenamiento nocturno</span>
              </div>
              <button
                onClick={() => void copiarComando()}
                className="cursor-pointer flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 font-medium"
              >
                {copiado ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">Copiado</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copiar</span>
                  </>
                )}
              </button>
            </div>
            <code className="block text-xs font-mono text-emerald-400 bg-black/60 p-2 rounded border border-neutral-800 select-all">
              {comandoEntrenamiento}
            </code>
          </div>
        )}
      </section>
    </div>
  );
}
