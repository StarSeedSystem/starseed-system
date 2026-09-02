"use client";

/**
 * PESTAÑA «INTELIGENCIA» (Adenda 218 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que Alex no podía ver: qué IA está usando el OS para cada cosa, con qué
 * modelo, cuántos tokens y cuánta ventana de contexto, qué procesos corren en
 * segundo plano, y dónde cambiar cualquiera de ellos.
 *
 * Existían las piezas —el router económico, su registro de rutas, el panel de
 * fuentes y claves, los agentes de fondo— pero el panel de inteligencia NO
 * estaba montado en ninguna pantalla. Esta pestaña las reúne en la ventana
 * de sistemas de Astraura y añade lo que faltaba: el registro vivo por tarea,
 * el uso de tokens/contexto por fuente, el agente de entonación y las
 * conexiones (cerebros, personalidades, memorias, archivos, proyectos,
 * pizarras, escritorios, widgets, enlaces) desde un mismo sitio.
 *
 * Honestidad: lo que aquí se muestra sale de datos reales del OS. Donde una
 * conexión aún abre su editor propio en vez de editarse en línea, se dice.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Activity, Brain, Cpu, Gauge, Mic2, RefreshCw, Sparkles, Link2, Layers,
    Users2, FolderOpen, Workflow, LayoutGrid, SquareKanban, Puzzle, Network, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { IntelligencePanel } from "@/components/settings/ai/intelligence-panel";
import { AgentesFondoSection } from "@/components/astraura/agentes-fondo-section";
import { readRouteLog, getIntelligenceSettings, saveIntelligenceSettings, type RouteRecord } from "@/ai/astraura/router";
import { estadoEntonacion, reflexionarEntonacion, EVENTO_ENTONACION, type DecisionEntonacion } from "@/lib/aurora/agente-entonacion";
import { TIMBRES, fijarTimbre } from "@/lib/aurora/timbres";
import { MOTORES_VOZ } from "@/lib/aurora/catalogo-voces";

/* ── Uso por fuente/modelo (tokens, contexto) ─────────────────────────────── */

interface UsoFuente {
    sourceId: string;
    sourceLabel: string;
    model: string;
    modelLabel: string;
    free: boolean;
    llamadas: number;
    ok: number;
    msMedio: number;
    inputTokens: number;
    outputTokens: number;
    ultima: number;
    tareas: Record<string, number>;
}

function agruparUso(log: RouteRecord[]): UsoFuente[] {
    const m = new Map<string, UsoFuente>();
    for (const r of log) {
        const k = `${r.sourceId}::${r.model}`;
        const u = m.get(k) ?? {
            sourceId: r.sourceId, sourceLabel: r.sourceLabel, model: r.model, modelLabel: r.modelLabel,
            free: r.free, llamadas: 0, ok: 0, msMedio: 0, inputTokens: 0, outputTokens: 0, ultima: 0, tareas: {},
        };
        u.llamadas += 1;
        if (r.ok) u.ok += 1;
        u.msMedio = Math.round((u.msMedio * (u.llamadas - 1) + (r.ms || 0)) / u.llamadas);
        const usage = (r as { usage?: { inputTokens?: number; outputTokens?: number } }).usage;
        u.inputTokens += usage?.inputTokens ?? 0;
        u.outputTokens += usage?.outputTokens ?? 0;
        u.ultima = Math.max(u.ultima, r.at);
        u.tareas[r.taskLabel] = (u.tareas[r.taskLabel] ?? 0) + 1;
        m.set(k, u);
    }
    return [...m.values()].sort((a, b) => b.ultima - a.ultima);
}

/** Ventana de contexto conocida por modelo (aprox., para orientar). */
function contextoDe(model: string): number | null {
    const m = model.toLowerCase();
    if (/1\.58|astraura|bitnet/.test(m)) return 4096;
    if (/nemotron.*ultra|550b/.test(m)) return 131072;
    if (/nemotron.*super|120b/.test(m)) return 131072;
    if (/nemotron.*nano|9b/.test(m)) return 131072;
    if (/gemma-4|gemma-3/.test(m)) return 131072;
    if (/llama-3\.[13]|llama-4/.test(m)) return 131072;
    if (/qwen3|qwen2\.5/.test(m)) return 32768;
    if (/deepseek/.test(m)) return 65536;
    if (/gpt-4o|gpt-5|o3|o4/.test(m)) return 128000;
    if (/claude/.test(m)) return 200000;
    if (/mistral|mixtral/.test(m)) return 32768;
    return null;
}

const hace = (t: number) => {
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return `hace ${s} s`;
    if (s < 3600) return `hace ${Math.round(s / 60)} min`;
    return `hace ${Math.round(s / 3600)} h`;
};

/* ── La pestaña ────────────────────────────────────────────────────────────── */

export function InteligenciaSection({ compact = false }: { compact?: boolean }) {
    const [log, setLog] = useState<RouteRecord[]>([]);
    const [ajustes, setAjustes] = useState(() => { try { return getIntelligenceSettings(); } catch { return null; } });
    const [entonacion, setEntonacion] = useState(() => { try { return estadoEntonacion(); } catch { return null; } });
    const [ultimaDecision, setUltimaDecision] = useState<DecisionEntonacion | null>(null);
    const [reflexionando, setReflexionando] = useState(false);
    const [vista, setVista] = useState<"uso" | "rutas" | "fondo" | "voz" | "fuentes" | "conexiones">("uso");

    const refrescar = useCallback(() => {
        try { setLog(readRouteLog()); } catch { /* */ }
        try { setAjustes(getIntelligenceSettings()); } catch { /* */ }
        try { setEntonacion(estadoEntonacion()); } catch { /* */ }
    }, []);

    useEffect(() => {
        refrescar();
        const id = window.setInterval(refrescar, 6000);
        const on = (e: Event) => { setUltimaDecision((e as CustomEvent<DecisionEntonacion>).detail); refrescar(); };
        window.addEventListener(EVENTO_ENTONACION, on);
        return () => { window.clearInterval(id); window.removeEventListener(EVENTO_ENTONACION, on); };
    }, [refrescar]);

    const uso = useMemo(() => agruparUso(log), [log]);
    const totalIn = uso.reduce((a, u) => a + u.inputTokens, 0);
    const totalOut = uso.reduce((a, u) => a + u.outputTokens, 0);
    const gratis = log.length ? Math.round((log.filter((r) => r.free).length / log.length) * 100) : 100;

    const pestanas: Array<{ id: typeof vista; label: string; icon: typeof Activity }> = [
        { id: "uso", label: "IA en uso", icon: Gauge },
        { id: "rutas", label: "Registro", icon: Activity },
        { id: "fondo", label: "Segundo plano", icon: Sparkles },
        { id: "voz", label: "Entonación", icon: Mic2 },
        { id: "fuentes", label: "Motores y claves", icon: Cpu },
        { id: "conexiones", label: "Conexiones", icon: Link2 },
    ];

    return (
        <div className="space-y-3">
            {/* Resumen honesto en una línea */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Dato etiqueta="Llamadas registradas" valor={String(log.length)} />
                <Dato etiqueta="Gratuitas" valor={`${gratis}%`} acento={gratis >= 90 ? "emerald" : "amber"} />
                <Dato etiqueta="Tokens entrada" valor={totalIn ? totalIn.toLocaleString("es") : "—"} />
                <Dato etiqueta="Tokens salida" valor={totalOut ? totalOut.toLocaleString("es") : "—"} />
            </div>

            <div className="flex flex-wrap gap-1.5">
                {pestanas.map((p) => (
                    <button
                        key={p.id}
                        type="button"
                        onClick={() => setVista(p.id)}
                        className={cn(
                            "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors",
                            vista === p.id ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/[0.03] text-white/65 hover:border-white/25",
                        )}
                    >
                        <p.icon className="h-3.5 w-3.5" /> {p.label}
                    </button>
                ))}
                <button type="button" onClick={refrescar} className="ml-auto inline-flex min-h-8 items-center gap-1 rounded-lg border border-white/10 px-2 text-[11px] text-white/55 hover:text-white/85" title="Refrescar">
                    <RefreshCw className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* ── IA en uso: por fuente/modelo con tokens y contexto ────────── */}
            {vista === "uso" && (
                <div className="space-y-2">
                    {uso.length === 0 && (
                        <p className="rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] text-white/55">
                            Todavía no hay llamadas registradas en esta neurona. En cuanto Astraura responda a algo, aquí verás qué modelo lo hizo, cuánto tardó y cuántos tokens usó.
                        </p>
                    )}
                    {uso.map((u) => {
                        const ctx = contextoDe(u.model);
                        const usadoCtx = u.llamadas ? Math.round((u.inputTokens + u.outputTokens) / u.llamadas) : 0;
                        return (
                            <div key={`${u.sourceId}::${u.model}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[12px] font-semibold text-white/90">{u.modelLabel || u.model}</span>
                                    <span className="text-[10.5px] text-white/50">· {u.sourceLabel}</span>
                                    <span className={cn("rounded-full border px-1.5 py-px text-[9px]", u.free ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200")}>{u.free ? "gratis" : "de pago"}</span>
                                    <span className="ml-auto text-[10px] text-white/40">{hace(u.ultima)}</span>
                                </div>
                                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10.5px] text-white/60 sm:grid-cols-4">
                                    <span>Llamadas: <b className="text-white/85">{u.llamadas}</b> ({u.ok} ok)</span>
                                    <span>Latencia media: <b className="text-white/85">{u.msMedio} ms</b></span>
                                    <span>Tokens: <b className="text-white/85">{u.inputTokens ? `${u.inputTokens.toLocaleString("es")} → ${u.outputTokens.toLocaleString("es")}` : "no reportados"}</b></span>
                                    <span>Contexto: <b className="text-white/85">{ctx ? `${usadoCtx.toLocaleString("es")} / ${ctx.toLocaleString("es")}` : "desconocido"}</b></span>
                                </div>
                                {ctx && usadoCtx > 0 && (
                                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10">
                                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-400" style={{ width: `${Math.min(100, (usadoCtx / ctx) * 100)}%` }} />
                                    </div>
                                )}
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                    {Object.entries(u.tareas).map(([t, n]) => (
                                        <span key={t} className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-px text-[9.5px] text-white/60">{t} ×{n}</span>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Registro de rutas: qué tarea fue a qué modelo y por qué ───── */}
            {vista === "rutas" && (
                <div className="space-y-1.5">
                    {log.length === 0 && <p className="text-[11px] text-white/55">Sin rutas registradas todavía.</p>}
                    {[...log].reverse().slice(0, 40).map((r, i) => (
                        <div key={`${r.at}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[10.5px]">
                            <span className={cn("h-1.5 w-1.5 rounded-full", r.ok ? "bg-emerald-400" : "bg-rose-400")} />
                            <span className="font-medium text-white/85">{r.taskLabel}</span>
                            <ChevronRight className="h-3 w-3 text-white/30" />
                            <span className="text-white/75">{r.modelLabel || r.model}</span>
                            <span className="text-white/45">· {r.sourceLabel}</span>
                            <span className="text-white/40">· {r.ms} ms</span>
                            {typeof r.difficulty === "number" && <span className="text-white/40">· dificultad {Math.round(r.difficulty * 100)}%</span>}
                            <span className="ml-auto text-white/35">{hace(r.at)}</span>
                            {r.reason && <span className="basis-full text-[10px] text-white/45">{r.reason}</span>}
                        </div>
                    ))}
                </div>
            )}

            {/* ── Segundo plano: agentes imaginativos y automejora ──────────── */}
            {vista === "fondo" && (
                <div className="space-y-3">
                    <p className="text-[11px] text-white/55">
                        Los agentes que imaginan, reflexionan e investigan mientras no miras, con sus personalidades, cerebros y permisos. Todo modificable aquí.
                    </p>
                    <AgentesFondoSection compact={compact} />
                </div>
            )}

            {/* ── Entonación: el agente de la voz autónoma ──────────────────── */}
            {vista === "voz" && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.05] p-3">
                        <div className="flex items-center gap-2 text-[12px] font-semibold text-white/90">
                            <Mic2 className="h-4 w-4 text-fuchsia-300" /> Agente de entonación (voz autónoma)
                        </div>
                        <p className="mt-1 text-[11px] text-white/60">
                            Decide, para cada frase, timbre e instrucción según texto, hora, personalidad y su memoria de tono. En vivo usa heurísticas (cero espera); en segundo plano afina su política con el router económico.
                        </p>
                        {ultimaDecision && (
                            <p className="mt-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-[10.5px] text-white/70">
                                Última decisión: <b className="text-white/90">{ultimaDecision.timbreId}</b> · {ultimaDecision.motivo}
                                <br /><span className="text-white/50">«{ultimaDecision.instruct}»</span>
                            </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                disabled={reflexionando}
                                onClick={async () => { setReflexionando(true); const ok = await reflexionarEntonacion(); setReflexionando(false); refrescar(); if (!ok) { /* sin historial suficiente o router sin respuesta */ } }}
                                className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-fuchsia-400/40 bg-fuchsia-500/15 px-2.5 py-1 text-[11px] text-fuchsia-100 disabled:opacity-50"
                            >
                                <Sparkles className="h-3.5 w-3.5" /> {reflexionando ? "Reflexionando…" : "Reflexionar ahora"}
                            </button>
                            <span className="text-[10.5px] text-white/45">
                                Política: {entonacion?.politica.actualizada ? `afinada ${hace(entonacion.politica.actualizada)}` : "aún heurística"} · base {entonacion?.politica.generoBase ?? "neutra"} · memoria {entonacion?.memoria.historial.length ?? 0} decisiones
                            </span>
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="mb-2 text-[11px] font-semibold text-white/80">Timbre fijo (si no usas la autónoma)</p>
                        <div className="flex flex-wrap gap-1.5">
                            {TIMBRES.map((t) => (
                                <button key={t.id} type="button" onClick={() => fijarTimbre(t.id)} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10.5px] text-white/70 hover:border-fuchsia-400/40" title={t.desc}>
                                    {t.nombre} <span className="text-white/40">· {t.genero}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="mb-2 text-[11px] font-semibold text-white/80">Motores de voz (catálogo)</p>
                        <div className="space-y-1.5">
                            {MOTORES_VOZ.map((m) => (
                                <div key={m.id} className="flex flex-wrap items-center gap-2 text-[10.5px]">
                                    <span className="font-medium text-white/85">{m.nombre}</span>
                                    <span className="text-white/45">· {m.formato}</span>
                                    <span className={cn("rounded-full border px-1.5 py-px text-[9px]", m.offline ? "border-emerald-400/30 text-emerald-200" : "border-amber-400/30 text-amber-200")}>{m.offline ? "sin internet" : "requiere red"}</span>
                                    {m.repo && <a href={m.repo} target="_blank" rel="noreferrer" className="text-cyan-300/80 hover:text-cyan-200">repositorio</a>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Motores, fuentes y claves: el panel completo ──────────────── */}
            {vista === "fuentes" && (
                <div className="space-y-2">
                    {ajustes && (
                        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px]">
                            <label className="inline-flex items-center gap-2">
                                <input type="checkbox" checked={!!ajustes.freeFirst} onChange={(e) => { saveIntelligenceSettings({ freeFirst: e.target.checked }); refrescar(); }} />
                                Gratuitos primero
                            </label>
                            <span className="text-white/45">Modo: {String((ajustes as { mode?: string }).mode ?? "auto")}</span>
                        </div>
                    )}
                    <IntelligencePanel />
                </div>
            )}

            {/* ── Conexiones: todo lo que se puede vincular a la inteligencia ── */}
            {vista === "conexiones" && (
                <div className="grid gap-2 sm:grid-cols-2">
                    {[
                        { icon: Brain, label: "Cerebros y memorias", desc: "Qué cerebro alimenta a cada agente y qué memorias lee o escribe.", href: "/cuenta#aurora-ia", evento: null },
                        { icon: Users2, label: "Personalidades", desc: "Carácter, herramientas y voz de cada personalidad de Astraura.", href: null, evento: "starseed:open-astraura-config", detalle: { section: "astraura" } },
                        { icon: FolderOpen, label: "Archivos y carpetas", desc: "Carpetas del dispositivo y almacenamientos externos vinculados.", href: null, evento: "starseed:open-astraura-config", detalle: { section: "cerebro" } },
                        { icon: Layers, label: "Proyectos", desc: "Proyectos a los que un agente puede leer y escribir.", href: "/proyectos", evento: null },
                        { icon: Workflow, label: "Workflows", desc: "Flujos que los agentes ejecutan o disparan.", href: "/workflows", evento: null },
                        { icon: SquareKanban, label: "Pizarras", desc: "Pizarras donde los procesos imaginativos dejan sus ideas.", href: "/pizarras", evento: null },
                        { icon: LayoutGrid, label: "Escritorios y widgets", desc: "Qué escritorio y qué widgets puede componer Astraura.", href: "/escritorios", evento: null },
                        { icon: Puzzle, label: "Integraciones y APIs", desc: "Servicios y claves que la inteligencia puede usar.", href: null, evento: "starseed:open-astraura-config", detalle: { section: "integraciones" } },
                        { icon: Network, label: "Enlaces y red", desc: "Neuronas, malla y accesos entre dispositivos.", href: null, evento: "starseed:open-astraura-config", detalle: { section: "neuronas" } },
                    ].map((c) => (
                        <button
                            key={c.label}
                            type="button"
                            onClick={() => {
                                if (c.evento) { try { window.dispatchEvent(new CustomEvent(c.evento, { detail: c.detalle })); } catch { /* */ } }
                                else if (c.href) { try { window.location.assign(c.href); } catch { /* */ } }
                            }}
                            className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left transition-colors hover:border-cyan-400/40"
                        >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/25 bg-cyan-500/10">
                                <c.icon className="h-4 w-4 text-cyan-200" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[12px] font-semibold text-white/90">{c.label}</span>
                                <span className="block text-[10.5px] leading-snug text-white/55">{c.desc}</span>
                            </span>
                        </button>
                    ))}
                    <p className="text-[10.5px] text-white/45 sm:col-span-2">
                        Cada conexión abre su editor propio; la vinculación por agente (cerebro, permisos, personalidad) se hace en «Segundo plano».
                    </p>
                </div>
            )}
        </div>
    );
}

function Dato({ etiqueta, valor, acento }: { etiqueta: string; valor: string; acento?: "emerald" | "amber" }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <div className="text-[9.5px] uppercase tracking-wider text-white/40">{etiqueta}</div>
            <div className={cn("text-[15px] font-semibold", acento === "emerald" ? "text-emerald-200" : acento === "amber" ? "text-amber-200" : "text-white/90")}>{valor}</div>
        </div>
    );
}

export default InteligenciaSection;
