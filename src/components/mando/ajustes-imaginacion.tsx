"use client";

/**
 * Ajustes de Imaginación (Ola 1021I · IMN1021I)
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: «un switch de automático, selección del número de rango de tareas
 * autodesarrolladas y horarios repartidos o inteligentes». Este componente es
 * el mismo en Ajustes y dentro del medidor «Imaginación» del pulso.
 *
 * Regla fija, no editable: lo importante siempre espera el visto bueno de Alex;
 * ningún interruptor salta esa puerta. Guarda con POST `/api/mando/imaginacion`
 * (solo local, 404 en producción); jamás envía claves ni rutas del disco.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
    AJUSTES_POR_DEFECTO,
    NOMBRE_FUENTE,
    validarAjustes,
    type AjustesAutodesarrollo,
    type FranjaHoraria,
    type FuentePropuesta,
} from "@/lib/mando/imaginacion-tipos";

const RUTA = "/api/mando/imaginacion";
const DIAS = ["D", "L", "M", "X", "J", "V", "S"] as const;
const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const FUENTES = Object.keys(AJUSTES_POR_DEFECTO.fuentes) as FuentePropuesta[];

/** «Todos los días», «De lunes a viernes» o la lista de días, sin inventar ninguno. */
export function textoDias(dias: number[]): string {
    const limpios = [...new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (limpios.length === 7) return "Todos los días";
    if (limpios.length === 0) return "Ningún día";
    if (limpios.length === 5 && limpios.every((d, i) => d === i + 1)) return "De lunes a viernes";
    return limpios.map((d) => DIAS_LARGOS[d]).join(", ");
}

/** Una franja en una línea: «Todos los días · 02:00–06:00». */
export function textoFranja(f: FranjaHoraria): string {
    return `${textoDias(f.dias)} · ${f.desde}–${f.hasta}`;
}

/** Rango doble 0–10, ordenado y entero aunque el deslizador mande los dedos cruzados. */
export function recortarRango(valores: number[]): { min: number; max: number } {
    const uno = (v: number | undefined, def: number) =>
        typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(10, Math.round(v))) : def;
    const a = uno(valores[0], 0);
    const b = uno(valores[1], 10);
    return { min: Math.min(a, b), max: Math.max(a, b) };
}

/** Enciende o apaga un día de la franja conservando el orden 0–6. */
export function alternarDia(dias: number[], dia: number): number[] {
    const siguientes = new Set(dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
    if (dia < 0 || dia > 6 || !Number.isInteger(dia)) return [...siguientes].sort((a, b) => a - b);
    if (siguientes.has(dia)) siguientes.delete(dia);
    else siguientes.add(dia);
    return [...siguientes].sort((a, b) => a - b);
}

export interface AjustesImaginacionProps {
    /** En el medidor del pulso se ocultan las explicaciones largas. */
    compacto?: boolean;
}

export function AjustesImaginacion({ compacto = false }: AjustesImaginacionProps) {
    const [ajustes, setAjustes] = useState<AjustesAutodesarrollo | null>(null);
    const [cargando, setCargando] = useState(true);
    const [soloLocal, setSoloLocal] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState<{ tono: "ok" | "error"; texto: string } | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        setSoloLocal(false);
        try {
            const r = await fetch(RUTA, { cache: "no-store" });
            if (r.status === 404) {
                setSoloLocal(true);
                return;
            }
            if (!r.ok) throw new Error(String(r.status));
            const cuerpo = (await r.json()) as { ajustes?: unknown } | null;
            setAjustes(validarAjustes(cuerpo && typeof cuerpo === "object" ? (cuerpo.ajustes ?? cuerpo) : undefined));
        } catch {
            setAviso({ tono: "error", texto: "No se pudieron leer los ajustes de imaginación (la consola local no respondió)." });
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const cambiar = useCallback((cambio: (a: AjustesAutodesarrollo) => AjustesAutodesarrollo) => {
        setAjustes((a) => (a ? cambio(structuredClone(a)) : a));
    }, []);

    const agregarFranja = useCallback(() => {
        cambiar((a) => ({
            ...a,
            horario: {
                ...a.horario,
                franjas: [...a.horario.franjas, { dias: [0, 1, 2, 3, 4, 5, 6], desde: "02:00", hasta: "06:00" }],
            },
        }));
    }, [cambiar]);

    const guardar = useCallback(async () => {
        if (!ajustes) return;
        setGuardando(true);
        setAviso(null);
        try {
            const r = await fetch(RUTA, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion: "ajustes", ajustes }),
            });
            if (!r.ok) throw new Error(String(r.status));
            const cuerpo = (await r.json().catch(() => null)) as { ajustes?: unknown } | null;
            setAjustes(validarAjustes(cuerpo?.ajustes ?? ajustes));
            setAviso({ tono: "ok", texto: "Ajustes guardados. El director los aplica en su próximo ciclo." });
        } catch {
            setAviso({ tono: "error", texto: "No se pudieron guardar los ajustes (la consola local no respondió)." });
        } finally {
            setGuardando(false);
        }
    }, [ajustes]);

    if (cargando) {
        return (
            <p className="flex items-center gap-2 text-sm text-white/60">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Leyendo los ajustes de imaginación…
            </p>
        );
    }

    if (soloLocal) {
        return (
            <p role="status" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                Los ajustes de imaginación solo existen en el Genesis local (404 en producción).
            </p>
        );
    }

    if (!ajustes) {
        return (
            <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                No se pudieron cargar los ajustes de imaginación.
            </p>
        );
    }

    const { min, max } = ajustes.rango;

    return (
        <section aria-label="Ajustes de imaginación" className="space-y-4 rounded-xl border border-white/10 bg-black/30 p-4">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                        <Sparkles className="h-4 w-4 text-emerald-300" aria-hidden />
                        Imaginación
                    </h3>
                    {!compacto && (
                        <p className="mt-0.5 text-xs text-white/50">
                            Qué se autodesarrolla solo, de qué fuentes sale y en qué horario.
                        </p>
                    )}
                </div>
                <Button type="button" size="sm" onClick={() => void guardar()} disabled={guardando} className="min-h-11 cursor-pointer">
                    {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Guardar ajustes
                </Button>
            </header>

            {aviso && (
                <p
                    role={aviso.tono === "error" ? "alert" : "status"}
                    className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                        aviso.tono === "error"
                            ? "border-red-400/30 bg-red-500/10 text-red-200"
                            : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                    }`}
                >
                    {aviso.tono === "error" ? (
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    ) : (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    )}
                    {aviso.texto}
                </p>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="flex min-h-11 items-center justify-between gap-3">
                        <div>
                            <h4 className="text-sm font-semibold text-white">Automático</h4>
                            <p className="mt-0.5 text-xs text-white/50">
                                {ajustes.automatico
                                    ? "Lo útil y no importante se desarrolla solo."
                                    : "Todo espera tu visto bueno."}
                            </p>
                        </div>
                        <Switch
                            id="switch-imaginacion-automatico"
                            checked={ajustes.automatico}
                            onCheckedChange={(v) => cambiar((a) => ({ ...a, automatico: v }))}
                            aria-label="Automático"
                        />
                    </div>
                </article>

                <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <h4 className="text-sm font-semibold text-white">Rango por ciclo</h4>
                    <p className="mt-0.5 text-xs text-white/60">
                        Tareas autodesarrolladas por ciclo: de {min} a {max}
                    </p>
                    <Slider
                        className="mt-4 [&_[role=slider]]:relative [&_[role=slider]]:before:absolute [&_[role=slider]]:before:-inset-3 [&_[role=slider]]:before:content-['']"
                        min={0}
                        max={10}
                        step={1}
                        value={[min, max]}
                        onValueChange={(v: number[]) => cambiar((a) => ({ ...a, rango: recortarRango(v) }))}
                        aria-label="Rango de tareas autodesarrolladas por ciclo"
                    />
                    <div className="mt-1 flex justify-between font-mono text-[11px] text-white/40">
                        <span>0</span>
                        <span>10</span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50">
                        Nunca más del máximo; el mínimo no se rellena con tareas inútiles.
                    </p>
                </article>

                <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <h4 className="text-sm font-semibold text-white">Fuentes</h4>
                    <ul className="mt-2 space-y-1.5">
                        {FUENTES.map((fuente) => (
                            <li key={fuente} className="flex min-h-11 items-center justify-between gap-3">
                                <span className="text-xs text-white/80">{NOMBRE_FUENTE[fuente]}</span>
                                <Switch
                                    checked={ajustes.fuentes[fuente]}
                                    onCheckedChange={(v) =>
                                        cambiar((a) => ({ ...a, fuentes: { ...a.fuentes, [fuente]: v } }))
                                    }
                                    aria-label={NOMBRE_FUENTE[fuente]}
                                />
                            </li>
                        ))}
                    </ul>
                </article>

                <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-white">Horario</h4>
                        <div role="group" aria-label="Modo de horario" className="flex gap-1 rounded-lg border border-white/10 bg-black/40 p-1">
                            {(["inteligente", "franjas"] as const).map((modo) => (
                                <button
                                    key={modo}
                                    type="button"
                                    aria-pressed={ajustes.horario.modo === modo}
                                    onClick={() => cambiar((a) => ({ ...a, horario: { ...a.horario, modo } }))}
                                    className={`min-h-11 cursor-pointer rounded-md px-3 text-xs transition-colors ${
                                        ajustes.horario.modo === modo
                                            ? "bg-emerald-500/20 text-emerald-100"
                                            : "text-white/60 hover:bg-white/10 hover:text-white"
                                    }`}
                                >
                                    {modo === "inteligente" ? "Inteligente" : "Por franjas"}
                                </button>
                            ))}
                        </div>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50">
                        Inteligente aprovecha la capacidad libre; por franjas, solo dentro de las horas elegidas.
                    </p>

                    {ajustes.horario.modo === "franjas" && (
                        <ul className="mt-3 space-y-2" aria-label="Franjas horarias">
                            {ajustes.horario.franjas.map((franja, índice) => (
                                <li key={índice} className="rounded-lg border border-white/10 bg-white/5 p-2">
                                    <p className="mb-1 font-mono text-[11px] text-white/50">{textoFranja(franja)}</p>
                                    <div role="group" aria-label={`Días de la franja ${índice + 1}`} className="flex flex-wrap gap-1">
                                        {DIAS.map((letra, dia) => (
                                            <button
                                                key={dia}
                                                type="button"
                                                aria-pressed={franja.dias.includes(dia)}
                                                aria-label={DIAS_LARGOS[dia]}
                                                onClick={() =>
                                                    cambiar((a) => ({
                                                        ...a,
                                                        horario: {
                                                            ...a.horario,
                                                            franjas: a.horario.franjas.map((f, i) =>
                                                                i === índice ? { ...f, dias: alternarDia(f.dias, dia) } : f,
                                                            ),
                                                        },
                                                    }))
                                                }
                                                className={`min-h-11 min-w-11 cursor-pointer rounded-md text-xs ${
                                                    franja.dias.includes(dia)
                                                        ? "bg-emerald-500/25 text-emerald-100"
                                                        : "bg-black/30 text-white/50 hover:text-white"
                                                }`}
                                            >
                                                {letra}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                                        <label className="flex items-center gap-1">
                                            Desde
                                            <input
                                                type="time"
                                                value={franja.desde}
                                                aria-label={`Desde, franja ${índice + 1}`}
                                                onChange={(e) =>
                                                    cambiar((a) => ({
                                                        ...a,
                                                        horario: {
                                                            ...a.horario,
                                                            franjas: a.horario.franjas.map((f, i) =>
                                                                i === índice ? { ...f, desde: e.target.value } : f,
                                                            ),
                                                        },
                                                    }))
                                                }
                                                className="min-h-11 cursor-pointer rounded border border-white/10 bg-black/40 px-2 text-xs text-white"
                                            />
                                        </label>
                                        <label className="flex items-center gap-1">
                                            Hasta
                                            <input
                                                type="time"
                                                value={franja.hasta}
                                                aria-label={`Hasta, franja ${índice + 1}`}
                                                onChange={(e) =>
                                                    cambiar((a) => ({
                                                        ...a,
                                                        horario: {
                                                            ...a.horario,
                                                            franjas: a.horario.franjas.map((f, i) =>
                                                                i === índice ? { ...f, hasta: e.target.value } : f,
                                                            ),
                                                        },
                                                    }))
                                                }
                                                className="min-h-11 cursor-pointer rounded border border-white/10 bg-black/40 px-2 text-xs text-white"
                                            />
                                        </label>
                                        <button
                                            type="button"
                                            aria-label={`Quitar franja ${índice + 1}`}
                                            onClick={() =>
                                                cambiar((a) => ({
                                                    ...a,
                                                    horario: {
                                                        ...a.horario,
                                                        franjas: a.horario.franjas.filter((_, i) => i !== índice),
                                                    },
                                                }))
                                            }
                                            className="ml-auto min-h-11 min-w-11 cursor-pointer rounded p-2 text-white/60 hover:bg-red-500/20 hover:text-red-200"
                                        >
                                            <Trash2 className="h-4 w-4" aria-hidden />
                                        </button>
                                    </div>
                                </li>
                            ))}
                            <li>
                                <Button type="button" variant="outline" size="sm" onClick={agregarFranja} className="min-h-11 cursor-pointer">
                                    <Plus className="h-4 w-4" />
                                    Añadir franja
                                </Button>
                            </li>
                        </ul>
                    )}

                    <div className="mt-3 flex min-h-11 items-center justify-between gap-3">
                        <span className="text-xs text-white/80">Repartir entre franjas</span>
                        <Switch
                            checked={ajustes.horario.repartir}
                            onCheckedChange={(v) =>
                                cambiar((a) => ({ ...a, horario: { ...a.horario, repartir: v } }))
                            }
                            aria-label="Repartir entre franjas"
                        />
                    </div>
                </article>

                <article className="rounded-xl border border-white/10 bg-black/30 p-4">
                    <h4 className="text-sm font-semibold text-white">Imaginación profunda</h4>
                    <label htmlFor="profunda-cada-dias" className="mt-1 block text-xs text-white/60">
                        Imaginación profunda cada N días (0 = nunca)
                    </label>
                    <input
                        id="profunda-cada-dias"
                        type="number"
                        min={0}
                        max={365}
                        step={1}
                        value={ajustes.profunda.cada_dias}
                        onChange={(e) =>
                            cambiar((a) => ({ ...a, profunda: { cada_dias: Number(e.target.value) } }))
                        }
                        className="mt-2 min-h-11 w-24 cursor-pointer rounded-lg border border-white/10 bg-black/40 px-3 font-mono text-sm text-white outline-none focus:border-white/30"
                    />
                    <p className="mt-1 text-[11px] text-white/50">
                        {ajustes.profunda.cada_dias === 0
                            ? "Nunca: no se programa la sesión profunda."
                            : `Cada ${ajustes.profunda.cada_dias} ${ajustes.profunda.cada_dias === 1 ? "día" : "días"}.`}
                    </p>
                </article>
            </div>

            <p role="note" className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                Lo importante siempre espera tu visto bueno: ningún interruptor salta esa regla.
            </p>
        </section>
    );
}
