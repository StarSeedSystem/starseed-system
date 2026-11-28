"use client";

/**
 * VistaCerebroOrganos — Visualizador vivo 2D · 3D · 4D de Cerebros y Órganos (2026-11-27).
 * ==========================================================================================
 * Muestra la arquitectura viva interconectada: cerebros (privados y públicos), órganos
 * configurables, neuronas y sus aparatos (@idUnico + color), agentes/bots, procesos y señales.
 * Ligero y compatible con móviles Android/WebView sin depender de contextos WebGL pesados.
 */

import { useEffect, useMemo, useState } from "react";
import { Box, Eye, Layers, Network, Orbit, Pause, Play, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CAPAS_ORGANO_DISPONIBLES,
  construirGrafoOrganos,
  type CerebroResumen,
  type FormatoVisualOrgano,
  type NodoCerebroVisual,
  type OrganoCerebro,
} from "@/lib/cerebros/organos";
import type { Neuron } from "@/lib/neurons/neurons";

export interface VistaCerebroOrganosProps {
  organos: readonly OrganoCerebro[];
  neuronas: readonly Neuron[];
  cerebros: readonly CerebroResumen[];
  agentesNombres?: readonly string[];
  procesosNombres?: readonly string[];
  formatoInicial?: FormatoVisualOrgano;
  onElegirOrgano?: (organoId: string) => void;
  onElegirNeurona?: (neuronaId: string) => void;
}

interface PuntoProyectado {
  nodo: NodoCerebroVisual;
  px: number;
  py: number;
  escala: number;
  radio: number;
}

const TAMANO_RADIO_TIPO: Record<NodoCerebroVisual["tipo"], number> = {
  cerebro: 18,
  organo: 16,
  neurona: 13,
  agente: 11,
  proceso: 10,
  aparato: 9,
  senal: 8,
};

export function VistaCerebroOrganos({
  organos,
  neuronas,
  cerebros,
  agentesNombres,
  procesosNombres,
  formatoInicial = "4d",
  onElegirOrgano,
  onElegirNeurona,
}: VistaCerebroOrganosProps) {
  const [formato, setFormato] = useState<FormatoVisualOrgano>(formatoInicial);
  const [capas, setCapas] = useState<string[]>(() => CAPAS_ORGANO_DISPONIBLES.map((c) => c.id));
  const [soloPublicos, setSoloPublicos] = useState(false);
  const [rotacion, setRotacion] = useState({ yaw: 0.45, pitch: 0.25 });
  const [fase4D, setFase4D] = useState(0);
  const [reproduciendo4D, setReproduciendo4D] = useState(true);
  const [seleccionado, setSeleccionado] = useState<NodoCerebroVisual | null>(null);
  const [arrastre, setArrastre] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (formato !== "4d" || !reproduciendo4D) return;
    const t = window.setInterval(() => {
      setFase4D((f) => (f + 0.08) % (Math.PI * 20));
    }, 90);
    return () => window.clearInterval(t);
  }, [formato, reproduciendo4D]);

  const grafo = useMemo(
    () =>
      construirGrafoOrganos({
        organos,
        neuronas,
        cerebros,
        capasVisibles: capas,
        soloPublicos,
        agentesNombres,
        procesosNombres,
      }),
    [organos, neuronas, cerebros, capas, soloPublicos, agentesNombres, procesosNombres],
  );

  const proyectados = useMemo(() => {
    const W = 680;
    const H = 360;
    const cx = W / 2;
    const cy = H / 2;
    const cosY = Math.cos(rotacion.yaw + (formato === "4d" ? fase4D * 0.14 : 0));
    const sinY = Math.sin(rotacion.yaw + (formato === "4d" ? fase4D * 0.14 : 0));
    const cosP = Math.cos(rotacion.pitch);
    const sinP = Math.sin(rotacion.pitch);

    const mapa = new Map<string, PuntoProyectado>();
    const lista: PuntoProyectado[] = grafo.nodos.map((nodo, idx) => {
      const onda = formato === "4d" ? Math.sin(fase4D + idx * 0.85) * 0.05 : 0;
      if (formato === "2d") {
        const px = cx + nodo.x * 230;
        const py = cy + nodo.y * 135;
        const pt: PuntoProyectado = {
          nodo,
          px,
          py,
          escala: 1,
          radio: TAMANO_RADIO_TIPO[nodo.tipo] ?? 11,
        };
        mapa.set(nodo.id, pt);
        return pt;
      }
      // Proyección 3D / 4D con perspectiva ligera sin WebGL
      const x0 = nodo.x + onda;
      const y0 = nodo.y + onda * 0.6;
      const z0 = nodo.z + (formato === "4d" ? Math.cos(fase4D * 0.9 + idx) * 0.09 : 0);

      const x1 = x0 * cosY - z0 * sinY;
      const z1 = x0 * sinY + z0 * cosY;
      const y2 = y0 * cosP - z1 * sinP;
      const z2 = y0 * sinP + z1 * cosP;

      const distancia = 2.4;
      const factor = distancia / Math.max(0.8, distancia - z2);
      const px = cx + x1 * 210 * factor;
      const py = cy + y2 * 130 * factor;
      const pt: PuntoProyectado = {
        nodo,
        px,
        py,
        escala: factor,
        radio: (TAMANO_RADIO_TIPO[nodo.tipo] ?? 11) * factor,
      };
      mapa.set(nodo.id, pt);
      return pt;
    });

    lista.sort((a, b) => a.escala - b.escala);
    return { lista, mapa, W, H };
  }, [grafo.nodos, formato, rotacion, fase4D]);

  const toggleCapa = (id: string) => {
    setCapas((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  return (
    <section
      aria-label="Mapa visual 2D, 3D y 4D de cerebros y órganos"
      className="w-full min-w-0 max-w-full rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-500/[0.06] via-black/40 to-violet-500/[0.06] p-3 sm:p-4 space-y-3"
      data-testid="vista-cerebro-organos"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-cyan-50">
            <Orbit className="h-4 w-4 text-cyan-300" aria-hidden />
            Topología viva de cerebros, órganos y neuronas
          </h4>
          <p className="text-[11px] text-white/55">
            Visualiza e inspecciona interconexiones en 2D, 3D o 4D vivo entre órganos, neuronas, agentes y capas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Formato visual">
          {(
            [
              ["2d", "2D plano", Network],
              ["3d", "3D espacial", Box],
              ["4d", "4D vivo", Sparkles],
            ] as const
          ).map(([id, etiqueta, Ic]) => (
            <button
              key={id}
              type="button"
              aria-pressed={formato === id}
              onClick={() => setFormato(id)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                formato === id
                  ? "border-cyan-400/50 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-black/30 text-white/65 hover:border-white/25 hover:text-white",
              )}
            >
              <Ic className="h-3.5 w-3.5" aria-hidden />
              {etiqueta}
            </button>
          ))}

          {formato === "4d" && (
            <button
              type="button"
              onClick={() => setReproduciendo4D((v) => !v)}
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-fuchsia-400/35 bg-fuchsia-500/15 px-2.5 py-1.5 text-xs font-medium text-fuchsia-100 hover:bg-fuchsia-500/25"
            >
              {reproduciendo4D ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
              {reproduciendo4D ? "Pausar 4D" : "Reanudar 4D"}
            </button>
          )}
        </div>
      </div>

      {/* Controles de capas y filtro privado/público */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-white/45">
          <Layers className="h-3 w-3" aria-hidden /> Capas:
        </span>
        {CAPAS_ORGANO_DISPONIBLES.map((c) => {
          const activa = capas.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={activa}
              onClick={() => toggleCapa(c.id)}
              className={cn(
                "cursor-pointer rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                activa
                  ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
                  : "border-white/10 bg-black/20 text-white/45 hover:text-white/80",
              )}
            >
              {c.etiqueta}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={soloPublicos}
          onClick={() => setSoloPublicos((v) => !v)}
          className={cn(
            "ml-auto inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
            soloPublicos
              ? "border-violet-400/45 bg-violet-500/20 text-violet-100"
              : "border-white/10 bg-black/20 text-white/60 hover:text-white/85",
          )}
        >
          <Eye className="h-3 w-3" aria-hidden />
          {soloPublicos ? "Solo públicos" : "Privados + públicos"}
        </button>
      </div>

      {/* Lienzo SVG interactivo 2D/3D/4D */}
      <div
        className="relative w-full overflow-hidden rounded-xl border border-white/10 bg-black/55 touch-pan-y"
        onPointerDown={(e) => {
          if (formato === "2d") return;
          setArrastre({ x: e.clientX, y: e.clientY });
        }}
        onPointerMove={(e) => {
          if (!arrastre || formato === "2d") return;
          const dx = e.clientX - arrastre.x;
          const dy = e.clientY - arrastre.y;
          setArrastre({ x: e.clientX, y: e.clientY });
          setRotacion((r) => ({
            yaw: r.yaw + dx * 0.008,
            pitch: Math.max(-1.1, Math.min(1.1, r.pitch + dy * 0.008)),
          }));
        }}
        onPointerUp={() => setArrastre(null)}
        onPointerLeave={() => setArrastre(null)}
      >
        <svg
          viewBox={`0 0 ${proyectados.W} ${proyectados.H}`}
          className="h-[260px] w-full sm:h-[320px]"
          role="img"
          aria-label={`Visualización ${formato.toUpperCase()} con ${grafo.nodos.length} nodos y ${grafo.aristas.length} enlaces`}
        >
          <defs>
            <radialGradient id="halo-central" cx="50%" cy="50%" r="55%">
              <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.12" />
              <stop offset="60%" stopColor="#8b5cf6" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width={proyectados.W} height={proyectados.H} fill="url(#halo-central)" />

          {/* Aristas */}
          {grafo.aristas.map((ar, i) => {
            const p1 = proyectados.mapa.get(ar.de);
            const p2 = proyectados.mapa.get(ar.a);
            if (!p1 || !p2) return null;
            const pulsoOp = formato === "4d" ? 0.35 + 0.35 * Math.abs(Math.sin(fase4D + i * 0.5)) : 0.45;
            return (
              <line
                key={`${ar.de}-${ar.a}-${i}`}
                x1={p1.px}
                y1={p1.py}
                x2={p2.px}
                y2={p2.py}
                stroke={ar.color}
                strokeOpacity={pulsoOp * ar.intensidad}
                strokeWidth={formato === "4d" ? 1.8 : 1.3}
                strokeDasharray={ar.capa === "senales" ? "4 3" : undefined}
              />
            );
          })}

          {/* Nodos */}
          {proyectados.lista.map((pt) => {
            const { nodo, px, py, radio } = pt;
            const esSel = seleccionado?.id === nodo.id;
            return (
              <g
                key={nodo.id}
                transform={`translate(${px}, ${py})`}
                className="cursor-pointer"
                onClick={() => {
                  setSeleccionado(nodo);
                  if (nodo.tipo === "organo" && nodo.organoId) onElegirOrgano?.(nodo.organoId);
                  if (nodo.tipo === "neurona") onElegirNeurona?.(nodo.id.replace(/^neu:/, ""));
                }}
              >
                <circle
                  r={radio + (esSel ? 6 : 3)}
                  fill={nodo.color}
                  fillOpacity={esSel ? 0.28 : 0.12}
                />
                <circle
                  r={radio}
                  fill="#0b101b"
                  stroke={nodo.color}
                  strokeWidth={esSel ? 2.5 : 1.6}
                  strokeDasharray={nodo.visibilidad === "publico" ? undefined : undefined}
                />
                <text
                  y={radio + 12}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="10"
                  fontWeight={esSel ? "700" : "500"}
                >
                  {nodo.titulo.length > 22 ? `${nodo.titulo.slice(0, 21)}…` : nodo.titulo}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/55">
          <span>
            {grafo.nodos.length} nodos · {grafo.aristas.length} conexiones · {formato.toUpperCase()}
          </span>
          {formato !== "2d" && <span>Arrastra para rotar el espacio · Toca un nodo para inspeccionar</span>}
        </div>
      </div>

      {/* Inspector del nodo tocado */}
      {seleccionado && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-xs">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-white">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: seleccionado.color }} aria-hidden />
              {seleccionado.titulo}
              <span className="rounded-full border border-white/15 bg-white/5 px-1.5 py-px text-[10px] uppercase text-white/70">
                {seleccionado.tipo}
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-1.5 py-px text-[10px] text-white/70">
                {seleccionado.visibilidad}
              </span>
            </p>
            {seleccionado.subtitulo && <p className="text-[11px] text-white/60">{seleccionado.subtitulo}</p>}
          </div>
          <button
            type="button"
            onClick={() => setSeleccionado(null)}
            className="cursor-pointer rounded-md border border-white/15 px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
          >
            Cerrar detalle
          </button>
        </div>
      )}
    </section>
  );
}

export default VistaCerebroOrganos;
