"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Sparkles, ShieldCheck, Cpu } from "lucide-react";
import { HABILIDADES_INGENIERIA } from "@/ai/astraura/skills-ingenieria";
import { PUNTOS_DECISION, type MedioLaya } from "@/lib/astraura/laya/puntos-decision";
import { umbralRecalibrado, type RegistroAprendizaje } from "@/lib/astraura/laya/aprendizaje-laya";
export type DondeEsta = "local" | "a1" | "ninguno";
/** Respuesta nativa de Laya: choice, score o noul, con `probabilities` y `answer_confidence`. */
export interface RespuestaLaya {
    readonly type?: "choice" | "score" | "noul"; readonly choice?: string; readonly score?: string | number;
    readonly noul?: number; readonly probabilities?: Readonly<Record<string, number>>; readonly answer_confidence?: number;
}
/** Decisión ya medida; la respuesta es la nativa de Laya y la confianza sale de `answer_confidence` (calibrada). */
export interface DecisionLaya {
    readonly id: string; readonly punto: string; readonly respuesta: RespuestaLaya;
    readonly donde: MedioLaya; readonly ms: number;
    /** Lo privado se guarda solo como huella y nunca enseña su texto (§6). */
    readonly privado?: boolean;
}
export interface EstadoLaya { readonly donde: DondeEsta; readonly ultimaLatenciaMs: number | null }
export interface UmbralEfectivo { readonly punto: string; readonly umbral: number; readonly recalibrado: boolean }
const primeraClave = (p?: Readonly<Record<string, number>>): string | null => (p ? (Object.keys(p)[0] ?? null) : null);
/** Texto legible de una respuesta de Laya; en noul, «sí»/«no» con el corte en 0,5. */
export function textoDeRespuesta(r: RespuestaLaya): string {
    if (r.type === "choice") return r.choice ?? primeraClave(r.probabilities) ?? "—";
    if (r.type === "score") return r.score !== undefined ? String(r.score) : primeraClave(r.probabilities) ?? "—";
    if (typeof r.noul === "number") return r.noul >= 0.5 ? "sí" : "no";
    return primeraClave(r.probabilities) ?? "—";
}
/** Solo `answer_confidence` (calibrada) sirve para decidir con umbral; `confidence` no cuenta (§1). */
export function confianzaCalibrada(r: RespuestaLaya): number | null {
    const c = r.answer_confidence;
    return typeof c === "number" && Number.isFinite(c) ? c : null;
}
/** Umbrales que Laya aplica hoy: el recalibrado con ≥ 30 casos o el del catálogo (§6). */
export function umbralesEfectivos(registro: RegistroAprendizaje = [], ambito = "personal"): readonly UmbralEfectivo[] {
    return PUNTOS_DECISION.map((p) => {
        const umbral = umbralRecalibrado(registro, p.id, ambito);
        return { punto: p.id, umbral, recalibrado: umbral !== p.umbral };
    });
}
const DONDE: Record<DondeEsta, string> = { local: "Local", a1: "A1 (servidor propio)", ninguno: "Ninguno" };
const MEDIO: Record<MedioLaya, string> = { a1: "A1", mac: "Mac", navegador: "Navegador", malla: "Malla" }; const MARCO = "rounded-lg border border-white/10 bg-black/20 p-2 text-xs";
interface LayaDecisionesPanelProps {
    compacto?: boolean; estado?: EstadoLaya; decisiones?: readonly DecisionLaya[]; registro?: RegistroAprendizaje; ambito?: string;
}
export function LayaDecisionesPanel({
    compacto = false, estado = { donde: "ninguno", ultimaLatenciaMs: null },
    decisiones = [], registro = [], ambito = "personal",
}: LayaDecisionesPanelProps) {
    const [apagadas, setApagadas] = useState<ReadonlySet<string>>(() => new Set());
    const latencia = estado.ultimaLatenciaMs === null ? "sin medir" : `${Math.round(estado.ultimaLatenciaMs)} ms`;
    const alternar = (id: string) => setApagadas((prev) => {
        const siguiente = new Set(prev);
        if (siguiente.has(id)) siguiente.delete(id); else siguiente.add(id);
        return siguiente;
    });
    return (
        <div className={cn("space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4", compacto && "p-2")}>
            <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Decisiones de Laya</h3>
            </div>
            <div className={cn("flex items-center justify-between gap-2", MARCO)}>
                <span className="text-white/60">Ahora</span>
                <span className="text-right font-medium text-white">{DONDE[estado.donde]} · última latencia: {latencia}</span>
            </div>
            <div className="space-y-2">
                <h4 className="text-xs font-semibold text-white">Últimas decisiones</h4>
                {decisiones.length === 0 ? <p className="text-xs text-white/40">Todavía no hay decisiones medidas.</p>
                    : decisiones.map((d) => {
                    const confianza = confianzaCalibrada(d.respuesta);
                    return (
                    <div key={d.id} className={cn("flex items-center justify-between", MARCO)}>
                        <div>
                            <p className="font-medium text-white">{d.punto}</p>
                            <p className="text-white/60">{d.privado ? "Privada · sin texto" : textoDeRespuesta(d.respuesta)}
                                {" "}(confianza: {confianza === null ? "—" : confianza.toFixed(2)})</p>
                        </div>
                        <div className="text-right text-[10px] text-white/40">
                            <p>{MEDIO[d.donde]}</p><p>{Math.round(d.ms)} ms</p>
                        </div>
                    </div>
                    );
                })}
            </div>
            <div className="border-t border-white/10 pt-4">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
                    <ShieldCheck className="h-3 w-3 text-emerald-400" /> Umbrales efectivos
                </h4>
                <ul className="grid gap-1 sm:grid-cols-2">
                    {umbralesEfectivos(registro, ambito).map((u) => (
                        <li key={u.punto} className="flex items-center justify-between gap-2 text-[11px] text-white/60">
                            <span>{u.punto}</span>
                            <span className={u.recalibrado ? "text-cyan-300" : "text-white/40"}>
                                {u.umbral.toFixed(2)}{u.recalibrado ? " · recalibrado" : ""}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
            <div className="border-t border-white/10 pt-4">
                <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-white">
                    <Cpu className="h-3 w-3 text-emerald-400" /> Interruptores de habilidades
                </h4>
                <div className="flex flex-wrap gap-2">
                    {HABILIDADES_INGENIERIA.map((h) => {
                        const encendida = !apagadas.has(h.id);
                        return (
                            <button key={h.id} type="button" role="switch" aria-checked={encendida}
                                onClick={() => alternar(h.id)}
                                className={cn("cursor-pointer rounded-full px-2 py-1 text-[10px]",
                                    encendida ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-white/40")}>
                                {h.nombre}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
