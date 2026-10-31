"use client";
/** Panel «Decisiones de Laya» (Ajustes · Inteligencia · Ola 1018L · LYS1018N):
 * dónde está Laya y su última latencia; últimas decisiones (lo privado sin texto,
 * solo huella); umbrales efectivos (§6); interruptores de habilidades (§5). */
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { MIN_CASOS_UMBRAL, casosDe, umbralRecalibrado, type CasoLaya, type RegistroAprendizaje, type ResultadoLaya } from "@/lib/astraura/laya/aprendizaje-laya";
import { PUNTOS_DECISION, type MedioLaya } from "@/lib/astraura/laya/puntos-decision";
import { HABILIDADES_INGENIERIA } from "@/ai/astraura/skills-ingenieria";
export const CLAVE_HABILIDADES = "starseed.laya.habilidades.v1", CLAVE_REGISTRO = "starseed.laya.registro.v1";
/** Dónde está Laya ahora, en las palabras del panel. */
export type MedioPanel = "local" | "A1" | "ninguno";
/** Fila de una decisión visible: lo privado entra SOLO con su huella, sin texto. */
export interface FilaDecision { punto: string; respuesta: string; privado: boolean; p: number; medio: MedioLaya; ms: number; resultado: ResultadoLaya }
export interface UmbralPunto { id: string; umbral: number; recalibrado: boolean }
export interface SondeoLaya { viva: boolean; medio: MedioPanel; ms: number | null }
export interface PanelDecisionesLayaProps { registro?: RegistroAprendizaje; sondear?: () => Promise<SondeoLaya | null>; topeDecisiones?: number }
/* ── Derivaciones PURAS: entrada → salida, sin red, disco ni reloj ────────── */
export function medioPanel(de: MedioLaya | "local" | undefined): MedioPanel {
    return !de ? "ninguno" : de === "a1" || de === "malla" ? "A1" : "local";
}
/** Las últimas decisiones; lo privado entra con su huella y NUNCA con su texto. */
export function decisionesVisibles(registro: RegistroAprendizaje, tope = 8): FilaDecision[] {
    return registro.slice(-tope).reverse().map((c) =>
        ({ punto: c.punto, respuesta: c.estado, privado: c.privado, p: c.p, medio: c.donde, ms: c.ms, resultado: c.resultado }));
}
/** Umbral efectivo de cada punto: recalibrado con su ámbito dominante; sin casos, el del catálogo. */
export function umbralesEfectivos(registro: RegistroAprendizaje): UmbralPunto[] {
    return PUNTOS_DECISION.map(({ id }) => {
        const ambitos: Record<string, number> = {};
        for (const c of registro) if (c.punto === id) ambitos[c.ambito] = (ambitos[c.ambito] ?? 0) + 1;
        const dominante = Object.keys(ambitos).sort((a, b) => ambitos[b] - ambitos[a])[0] ?? "os";
        return { id, umbral: umbralRecalibrado(registro, id, dominante), recalibrado: casosDe(registro, id, dominante).length >= MIN_CASOS_UMBRAL };
    });
}
/** Interruptores de habilidades: todas ENCENDIDAS por defecto; el guardado solo las apaga. */
export function leerInterruptores(bruto: string | null): Record<string, boolean> {
    const activos: Record<string, boolean> = {};
    for (const h of HABILIDADES_INGENIERIA) activos[h.id] = true;
    try {
        const v = JSON.parse(bruto ?? "null") as Partial<Record<string, unknown>> | null;
        if (v) for (const h of HABILIDADES_INGENIERIA) if (typeof v[h.id] === "boolean") activos[h.id] = v[h.id] === true;
    } catch { /* guardado a medias: quedan los de fábrica */ }
    return activos;
}
/** Registro del aparato: lo escribe la tarea M con el mismo formato; sin datos, panel vacío y honesto. */
function registroDelAparato(): RegistroAprendizaje {
    try { const bruto = JSON.parse(localStorage.getItem(CLAVE_REGISTRO) ?? "[]") as CasoLaya[]; return Array.isArray(bruto) ? bruto : []; }
    catch { return []; }
}
/** Sonda por defecto del aparato: una petición GET con tope corto, SIN cargar el modelo (§2). */
async function sondearAparato(): Promise<SondeoLaya | null> {
    try {
        const control = new AbortController();
        const tope = setTimeout(() => control.abort(), 1500);
        const r = await fetch("http://127.0.0.1:4470/status", { signal: control.signal });
        clearTimeout(tope);
        await r.json();
        return r.ok ? { viva: true, medio: "local", ms: null } : { viva: false, medio: "ninguno", ms: null };
    } catch { return null; }
}
export function PanelDecisionesLaya({ registro, sondear, topeDecisiones = 8 }: PanelDecisionesLayaProps) {
    const [datos, setDatos] = useState<RegistroAprendizaje>(() => registro ?? registroDelAparato());
    const [sondeo, setSondeo] = useState<SondeoLaya | null>(null);
    const [inter, setInter] = useState<Record<string, boolean>>(() => leerInterruptores(localStorage.getItem(CLAVE_HABILIDADES)));
    useEffect(() => {
        let vivo = true;
        setDatos(registro ? registro : registroDelAparato());
        const preguntar = sondear ?? (registro ? null : sondearAparato);
        if (preguntar) (async () => { if (vivo) setSondeo(await preguntar()); })();
        return () => { vivo = false; };
    }, [registro, sondear]);
    const filas = decisionesVisibles(datos, topeDecisiones);
    const umbrales = umbralesEfectivos(datos);
    const donde: MedioPanel = sondeo?.viva ? sondeo.medio : filas.length ? medioPanel(filas[0].medio) : "ninguno";
    const msUltima: number | null = filas.length ? filas[0].ms : sondeo?.ms ?? null;
    const apagar = (id: string, valor: boolean) => {
        const nuevo = { ...inter, [id]: valor };
        setInter({ ...nuevo });
        try { localStorage.setItem(CLAVE_HABILIDADES, JSON.stringify(nuevo)); } catch { /* sin disco */ }
    };
    return (
        <div className="space-y-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-white/90"><Sparkles className="h-3.5 w-3.5 text-cyan-200" />Decisiones de Laya</span>
                <span className={cn("rounded-full border px-1.5 py-px", donde === "local" && "border-emerald-400/30 text-emerald-200", donde === "A1" && "border-cyan-400/30 text-cyan-200", donde === "ninguno" && "border-white/15 text-white/50")}>{donde === "local" ? "Laya en el aparato" : donde === "A1" ? "Laya por la malla al A1" : "Laya sin señal"}</span>
                {msUltima != null && <span className="text-white/45">última latencia: <b className="text-white/85">{msUltima} ms</b></span>}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-1.5 font-semibold text-white/80">Últimas decisiones</p>
                {filas.length === 0 && <p className="text-[10.5px] text-white/55">Ninguna decisión registrada todavía: el registro se llena en cuanto Laya decide en vivo (contrato §6).</p>}
                {filas.map((f, i) => (
                    <div key={`${f.punto}-${i}`} className="flex flex-wrap items-center gap-2 border-b border-white/5 py-1 text-[10.5px] last:border-0">
                        <span className="font-medium text-white/85">{f.punto}</span>
                        <span className="text-white/70">{f.privado ? `huella ${f.respuesta}` : f.respuesta || "sin texto"} · confianza {Math.round(f.p * 100)}% · {f.medio} · {f.ms} ms</span>
                        <span className={cn("ml-auto rounded-full border px-1.5 py-px", f.resultado === "aceptada" && "border-emerald-400/30 text-emerald-200", f.resultado === "corregida" && "border-amber-400/30 text-amber-200", f.resultado === "escalada" && "border-rose-400/30 text-rose-200")}>{f.resultado}</span>
                    </div>
                ))}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-1.5 font-semibold text-white/80">Umbrales efectivos (sobre answer_confidence, la calibrada)</p>
                {umbrales.map((u) => (
                    <span key={u.id} className={cn("mr-1 rounded-full border px-1.5 py-px text-[9.5px]", u.recalibrado ? "border-cyan-400/40 bg-cyan-500/10 text-cyan-100" : "border-white/10 bg-white/[0.04] text-white/60")} title={u.recalibrado ? "recalibrado con los casos reales" : "umbral del catálogo (menos de 30 casos)"}>{u.id} · {u.umbral.toFixed(2)}{u.recalibrado ? " ✱" : ""}</span>
                ))}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <p className="mb-1.5 font-semibold text-white/80">Habilidades de ingeniería (Laya elige cuál aplica)</p>
                {HABILIDADES_INGENIERIA.map((h) => (
                    <label key={h.id} className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-1 py-0.5 hover:bg-white/[0.04]" title={h.cuando}>
                        <span className="text-[10.5px] text-white/75">{h.nombre}</span>
                        <Switch checked={inter[h.id] ?? true} onCheckedChange={(v) => apagar(h.id, v)} aria-label={`Habilidad ${h.nombre}`} />
                    </label>
                ))}
            </div>
        </div>
    );
}
export default PanelDecisionesLaya;