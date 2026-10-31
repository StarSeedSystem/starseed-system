"use client";

// Panel «Decisiones de Laya» (Ola 1018L · LYS1018N, laya-y-habilidades.md §4–§5). PURA y desacoplada: estado,
// decisiones, umbrales e interruptores de habilidades ENTRAN por propiedades con datos de ejemplo por defecto.
// La confianza que cuenta es `answer_confidence` (calibrada), nunca `confidence`; lo privado no muestra texto.

import { cn } from "@/lib/utils";
import { Radar, Sparkles } from "lucide-react";

export type FormatoLaya = "choice" | "score" | "noul";
/** Dónde sirve Laya en este medio: servidor local, el A1 de la cuenta o ninguno. */
export type DondeLayaPanel = "local" | "a1" | "ninguno";
export interface EstadoLaya { readonly donde: DondeLayaPanel; readonly latenciaMs: number | null; }
export interface ProbabilidadLaya { readonly opcion: string; readonly p: number; }
export interface DecisionLaya {
  readonly id: string;
  readonly punto: string;
  readonly formato: FormatoLaya;
  readonly respuesta: string;
  /** Confianza calibrada con la que se decidió (0–1): la que se compara con el umbral. */
  readonly answer_confidence: number;
  readonly probabilidades?: readonly ProbabilidadLaya[]; // solo en choice, tal como llegó del checkpoint
  readonly donde: string;
  readonly ms: number;
  readonly privado: boolean; // si lo es, el texto nunca sale en pantalla (§4: solo queda la huella)
}
export interface UmbralEfectivo { readonly punto: string; readonly umbral: number; }
export const ESTADO_DEFECTO: EstadoLaya = { donde: "ninguno", latenciaMs: null };
/** Habilidades de ingeniería (§5, Matt Pocock, MIT); todas encendidas por defecto. */
export const HABILIDADES_DEFECTO: Record<string, boolean> =
  { tdd: true, "to-spec": true, "to-tickets": true, triage: true, "grill-me": true, handoff: true };
export function etiquetaEstado(estado: EstadoLaya): string {
  if (estado.donde === "ninguno") return "Laya no está sirviendo en este medio";
  return estado.donde === "a1" ? "Laya está en el A1" : "Laya está en local";
}
export const decimal = (n: number): string => n.toFixed(2).replace(".", ",");
/** Duda de Laya: la `answer_confidence` queda bajo el umbral efectivo del punto. */
export function dudas(caso: { punto: string; answer_confidence: number }, umbrales: readonly UmbralEfectivo[]): boolean {
  const u = umbrales.find((x) => x.punto === caso.punto);
  return u !== undefined && caso.answer_confidence < u.umbral;
}
// Decisiones de ejemplo con la forma real de Laya (§1): choice/probabilities, noul y una privada.
const DECISIONES_EJEMPLO: readonly DecisionLaya[] = [
  { id: "d1", punto: "habilidad.elegir", formato: "choice", respuesta: "tdd", answer_confidence: 0.87, probabilidades: [{ opcion: "tdd", p: 0.87 }, { opcion: "ninguna", p: 0.13 }], donde: "a1", ms: 3100, privado: false },
  { id: "d2", punto: "privacidad.subir", formato: "noul", respuesta: "sí", answer_confidence: 0.91, donde: "local", ms: 2400, privado: true },
  { id: "d3", punto: "publicar.moderar", formato: "choice", respuesta: "revisar", answer_confidence: 0.55, donde: "local", ms: 1950, privado: false },
];
const UMBRALES_EJEMPLO: readonly UmbralEfectivo[] = [
  { punto: "habilidad.elegir", umbral: 0.6 },
  { punto: "publicar.moderar", umbral: 0.6 }, { punto: "privacidad.subir", umbral: 0.5 },
];

interface LayaDecisionesPanelProps {
  compacto?: boolean; estado?: EstadoLaya;
  decisiones?: readonly DecisionLaya[]; umbrales?: readonly UmbralEfectivo[];
  habilidades?: Readonly<Record<string, boolean>>;
  onHabilidad?: (id: string, encendida: boolean) => void;
}

export function LayaDecisionesPanel({
  compacto = false, estado = ESTADO_DEFECTO, decisiones = DECISIONES_EJEMPLO,
  umbrales = UMBRALES_EJEMPLO, habilidades = HABILIDADES_DEFECTO, onHabilidad,
}: LayaDecisionesPanelProps) {
  return (
    <div className={cn("space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4", compacto && "p-2")}>
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-white">Decisiones de Laya</h3>
      </div>
      {/* Dónde está Laya ahora y su última latencia medida */}
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
        <Radar className="h-3 w-3 shrink-0 text-cyan-300" />
        <span className="font-medium text-white">{etiquetaEstado(estado)}</span>
        <span className="ml-auto text-white/50">Última latencia: {estado.latenciaMs == null ? "sin medir" : `${estado.latenciaMs} ms`}</span>
      </div>
      {/* Últimas decisiones: punto, respuesta, confianza, dónde y ms; lo privado sin texto */}
      <div className="space-y-2">
        {decisiones.map((d) => (
          <div key={d.id} className="rounded-lg border border-white/10 bg-black/20 p-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-white">{d.punto}</p>
                {d.privado ? (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/50">privado: sin texto</span>
                ) : (
                  <p className="text-white/70">{d.respuesta} · confianza {decimal(d.answer_confidence)}</p>
                )}
              </div>
              <div className="shrink-0 text-right text-[10px] text-white/40">
                <p>{d.donde}</p>
                <p>{d.ms} ms</p>
              </div>
            </div>
            {dudas(d, umbrales) && <p className="mt-1 text-[10px] text-amber-300">Duda: se aplica el respaldo del punto</p>}
          </div>
        ))}
      </div>
      {/* Umbrales efectivos, recalibrados por el aprendizaje (§6) */}
      <div className="flex flex-wrap gap-1 border-t border-white/10 pt-3">
        {umbrales.map((u) => (
          <span key={u.punto} className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">{u.punto} · umbral {decimal(u.umbral)}</span>
        ))}
      </div>
      {/* Habilidades de ingeniería: todas encendidas por defecto (§5) */}
      <div className="border-t border-white/10 pt-3">
        <h4 className="mb-2 text-xs font-semibold text-white">Habilidades de ingeniería (Matt Pocock, MIT)</h4>
        <div className="flex flex-wrap gap-2">
          {Object.entries(habilidades).map(([id, encendida]) => (
            <button
              key={id} type="button" aria-pressed={encendida} onClick={() => onHabilidad?.(id, !encendida)}
              className={cn("cursor-pointer rounded-full px-2 py-1 text-[10px] transition-colors duration-150",
                encendida ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white/40")}
            >
              {id} · {encendida ? "activa" : "apagada"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
