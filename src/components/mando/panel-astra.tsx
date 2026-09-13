"use client";

/**
 * Panel «Astra» del Centro de Mando (2026-09-08, Ola 294 · AR4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Astra (`gpt-6-astra`) es el DIRECTOR de orquestación: audita un ámbito del OS
 * y propone mejoras priorizadas; no escribe código (eso es de la flota gratuita).
 * Este panel muestra el gasto del día frente al techo, lanza la auditoría con
 * `POST /api/mando/astra` y convierte cada sugerencia en una tarea del
 * enjambre (`POST /api/mando/colas {accion:"guardar"}`). Sin clave, una
 * tarjeta explica dónde va (`~/.starseed/env`, `STARSEED_PASARELA_OPENAI_KEY`);
 * jamás se escribe ni se pide una clave en el cliente.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CircleDashed, Eye, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";

import { AMBITOS_ASTRA, priorizar, type SugerenciaAstra } from "@/lib/mando/astra";

interface AuditoriaGuardada {
    t?: string;
    ambito?: string;
    modelo?: string;
    costeUsd?: number;
    sugerencias?: number;
}

interface EstadoAstra {
    ambitos: string[];
    hayClave: boolean;
    gastoHoy: number;
    techo: number;
    ultimas: AuditoriaGuardada[];
}

interface RespuestaAuditoria {
    ok?: boolean;
    sugerencias?: SugerenciaAstra[];
    modelo?: string;
    tokensIn?: number;
    tokensOut?: number;
    costeUsd?: number;
    ms?: number;
    motivo?: string;
    error?: string;
}

const CLS_BTN = "inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-white/80 hover:bg-white/10";
const CLS_CHIP = "rounded-full border px-2 py-0.5 text-[11px]";

/** Chip de puntuación 1..5 con el color del Mando según la gravedad que convenga. */
function ChipPuntos({ etiqueta, valor, invertido }: { etiqueta: string; valor: number; invertido?: boolean }) {
    // `invertido` para impacto (5 es bueno → verde); esfuerzo/riesgo van al revés (5 → rojo).
    const nivel = invertido ? 6 - valor : valor;
    const tono =
        nivel >= 4 ? "border-red-400/30 bg-red-500/10 text-red-200"
        : nivel === 3 ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
        : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200";
    return <span className={`${CLS_CHIP} ${tono}`} title={`${etiqueta}: ${valor} de 5`}>{etiqueta} {valor}</span>;
}

/** Nombre de cola válido para `/api/mando/colas` (PATRON_NOMBRE: `^[0-9]{2,4}(-[a-z0-9]+){0,6}$`). */
export function nombreColaAstra(ambito: string, ahora = new Date()): string {
    const mmdd = `${String(ahora.getMonth() + 1).padStart(2, "0")}${String(ahora.getDate()).padStart(2, "0")}`;
    const hm = `${String(ahora.getHours()).padStart(2, "0")}${String(ahora.getMinutes()).padStart(2, "0")}`;
    const gruposAmbito = ambito.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return `900-astra-${gruposAmbito}-${mmdd}-${hm}`.split("-").slice(0, 7).join("-");
}

/** Panel «Astra»: audita el OS con el director y convierte sugerencias en tareas. */
export function PanelAstra() {
    const [estado, setEstado] = useState<EstadoAstra | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ambito, setAmbito] = useState<string>(AMBITOS_ASTRA[0]?.id ?? "funciones");
    const [auditando, setAuditando] = useState(false);
    const [segundos, setSegundos] = useState(0);
    const [sugerencias, setSugerencias] = useState<SugerenciaAstra[]>([]);
    const [motivo, setMotivo] = useState<string | null>(null);
    const [ultimoCoste, setUltimoCoste] = useState<string | null>(null);
    const [descartadas, setDescartadas] = useState<Set<string>>(new Set());
    const [convirtiendo, setConvirtiendo] = useState<string | null>(null);
    const reloj = useRef<number | null>(null);

    const cargar = useCallback(async () => {
        try {
            const r = await fetch("/api/mando/astra", { cache: "no-store" });
            if (!r.ok) { setError(`No se pudo leer el estado de Astra (HTTP ${r.status}).`); return; }
            setEstado((await r.json()) as EstadoAstra);
            setError(null);
        } catch {
            setError("No se pudo leer el estado de Astra.");
        }
    }, []);

    useEffect(() => { void cargar(); }, [cargar]);

    // Segundero solo mientras corre la auditoría.
    useEffect(() => {
        if (!auditando) return;
        reloj.current = window.setInterval(() => setSegundos((s) => s + 1), 1000);
        return () => { if (reloj.current) window.clearInterval(reloj.current); };
    }, [auditando]);

    const auditar = useCallback(async () => {
        setAuditando(true);
        setSegundos(0);
        setMotivo(null);
        setUltimoCoste(null);
        try {
            const r = await fetch("/api/mando/astra", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "auditar", ambito }),
            });
            const datos = (await r.json().catch(() => null)) as RespuestaAuditoria | null;
            if (!r.ok || !datos?.ok) {
                // Falta de saldo o de presupuesto viene en `motivo`: aviso honesto, no error genérico.
                setMotivo(datos?.motivo ?? datos?.error ?? `La auditoría no arrancó (HTTP ${r.status}).`);
                return;
            }
            setSugerencias(priorizar(datos.sugerencias ?? []));
            setDescartadas(new Set());
            setUltimoCoste(
                `${datos.modelo ?? "modelo"} · ${datos.tokensIn ?? 0}+${datos.tokensOut ?? 0} tokens · ${(datos.costeUsd ?? 0).toFixed(4)} USD · ${((datos.ms ?? 0) / 1000).toFixed(1)} s`,
            );
            void cargar();
        } catch {
            setMotivo("Sin conexión con la ruta de Astra.");
        } finally {
            setAuditando(false);
        }
    }, [ambito, cargar]);

    // Convierte la sugerencia en una cola del enjambre (una sola tarea) vía /api/mando/colas.
    const convertir = useCallback(async (s: SugerenciaAstra) => {
        if (!s.propuestaDeTarea) return;
        setConvirtiendo(s.id);
        try {
            const nombre = nombreColaAstra(s.ambito);
            const tarea = {
                id: "AS1",
                ola: `Astra · ${s.ambito}`,
                titulo: s.propuestaDeTarea.titulo.slice(0, 200),
                archivos: s.propuestaDeTarea.archivos.slice(0, 20),
                prompt: s.propuestaDeTarea.prompt,
                depende: [],
            };
            const r = await fetch("/api/mando/colas", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "guardar", nombre, tareas: [tarea] }),
            });
            const datos = (await r.json().catch(() => null)) as { ok?: boolean; errores?: string[] } | null;
            if (!r.ok || !datos?.ok) setError((datos?.errores ?? ["No se pudo guardar la cola."]).join(" "));
            else setDescartadas((prev) => new Set(prev).add(s.id));
        } catch {
            setError("Sin conexión con la ruta de colas.");
        } finally {
            setConvirtiendo(null);
        }
    }, []);

    if (estado && !estado.hayClave) {
        return (
            <section data-testid="panel-astra" className="space-y-4">
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 backdrop-blur">
                    <h3 className="text-sm font-semibold text-amber-100">Astra necesita su clave</h3>
                    <p className="mt-2 text-xs text-amber-100/80">
                        Astra es el director de orquestación: audita el OS y propone mejoras, no escribe el código.
                        Para activarlo, pon la clave en <code>~/.starseed/env</code> como{" "}
                        <code>STARSEED_PASARELA_OPENAI_KEY</code> y reinicia el Mando. La clave NUNCA se escribe
                        en el repositorio ni en ningún archivo versionado.
                    </p>
                </div>
            </section>
        );
    }

    const pct = estado && estado.techo > 0 ? Math.min(100, (estado.gastoHoy / estado.techo) * 100) : 0;
    const visibles = sugerencias.filter((s) => !descartadas.has(s.id));

    return (
        <section data-testid="panel-astra" className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <div className="flex flex-wrap items-center gap-3">
                    <div>
                        <h3 className="text-sm font-semibold text-white">Astra · director de orquestación</h3>
                        <p className="text-[11px] text-white/45">
                            Director de orquestación y diseñador de sistemas: audita y propone, no escribe el código.
                        </p>
                    </div>
                    <button type="button" onClick={() => void cargar()} className={`ml-auto ${CLS_BTN}`}>
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Actualizar
                    </button>
                </div>
                {/* Gasto del día frente al techo, con barra honesta. */}
                <div className="mt-3">
                    <p className="text-[11px] text-white/50">
                        Gasto de hoy: <strong className="text-white/80">{(estado?.gastoHoy ?? 0).toFixed(4)} USD</strong>
                        {" "}de {estado ? estado.techo.toFixed(2) : "—"} USD
                    </p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                            className={`h-full rounded-full ${pct > 80 ? "bg-red-400" : pct > 50 ? "bg-amber-400" : "bg-emerald-400"}`}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>
            </div>

            {error ? (
                <p role="status" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{error}</p>
            ) : null}
            {motivo ? (
                <p role="status" className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">{motivo}</p>
            ) : null}
            {ultimoCoste ? (
                <p role="status" className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">Última auditoría: {ultimoCoste}</p>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                <p className="mb-2 text-[11px] font-medium text-white/60">Ámbito a auditar</p>
                <div className="flex flex-wrap gap-1.5">
                    {AMBITOS_ASTRA.map((a) => (
                        <button
                            key={a.id}
                            type="button"
                            title={a.queMira}
                            onClick={() => setAmbito(a.id)}
                            className={`${CLS_CHIP} cursor-pointer ${
                                ambito === a.id
                                    ? "border-trinity-azure/40 bg-trinity-azure/15 text-trinity-azure"
                                    : "border-white/10 bg-white/5 text-white/55 hover:bg-white/10"
                            }`}
                        >
                            {a.etiqueta}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    onClick={() => void auditar()}
                    disabled={auditando}
                    className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {auditando ? <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Wand2 className="h-3.5 w-3.5" aria-hidden />}
                    {auditando ? `Auditando… ${segundos} s` : "Auditar"}
                </button>
            </div>

            <ul className="space-y-3">
                {visibles.map((s) => (
                    <li key={s.id} className="rounded-xl border border-white/10 bg-black/30 p-4 backdrop-blur">
                        <h4 className="text-sm font-semibold text-white">{s.titulo}</h4>
                        {s.porque ? <p className="mt-1 text-xs text-white/70">{s.porque}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <ChipPuntos etiqueta="impacto" valor={s.impacto} invertido />
                            <ChipPuntos etiqueta="esfuerzo" valor={s.esfuerzo} />
                            <ChipPuntos etiqueta="riesgo" valor={s.riesgo} />
                        </div>
                        {s.evidencia.length > 0 ? (
                            <ul className="mt-2 space-y-0.5">
                                {s.evidencia.map((e, i) => (
                                    <li key={i} className="text-[11px] text-white/45"><code className="text-white/60">{e}</code></li>
                                ))}
                            </ul>
                        ) : null}
                        <div className="mt-3 flex items-center gap-2 border-t border-white/5 pt-3">
                            <button
                                type="button"
                                onClick={() => void convertir(s)}
                                disabled={!s.propuestaDeTarea || convirtiendo === s.id}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-trinity-azure/30 bg-trinity-azure/10 px-2.5 py-1.5 text-xs text-trinity-azure hover:bg-trinity-azure/20 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {convirtiendo === s.id ? <CircleDashed className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
                                Convertir en tarea del enjambre
                            </button>
                            <button
                                type="button"
                                onClick={() => setDescartadas((prev) => new Set(prev).add(s.id))}
                                className={`${CLS_BTN} text-white/60`}
                            >
                                <Trash2 className="h-3 w-3" aria-hidden /> Descartar
                            </button>
                        </div>
                    </li>
                ))}
            </ul>

            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <h3 className="text-sm font-semibold text-white">Últimas auditorías</h3>
                {(estado?.ultimas?.length ?? 0) > 0 ? (
                    <ul className="mt-2 space-y-1">
                        {(estado?.ultimas ?? []).map((u, i) => (
                            <li key={`${u.t ?? ""}-${i}`} className="flex items-center gap-2 text-[11px] text-white/55">
                                <Eye className="h-3 w-3 shrink-0 text-white/30" aria-hidden />
                                <span className="font-mono text-white/40">{(u.t ?? "").slice(0, 19).replace("T", " ")}</span>
                                <span>{u.ambito ?? "?"}</span>
                                <span className="text-white/40">{u.modelo ?? ""}</span>
                                <span className="text-white/40">{typeof u.costeUsd === "number" ? `${u.costeUsd.toFixed(4)} USD` : ""}</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="mt-2 text-xs text-white/40">Todavía no hay auditorías guardadas.</p>
                )}
            </div>
        </section>
    );
}

