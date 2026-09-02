"use client";

/**
 * VARIEDADES DE TIMBRE + MOTOR (Adenda 213 · 2026-09-01)
 * ─────────────────────────────────────────────────────────────────────────────
 * Se despliega bajo el género elegido y muestra sus variedades con nombre
 * propio. Pulsar una la fija y la reproduce: lo que oyes es exactamente lo que
 * quedará, porque cada timbre es una receta fija (voz base + tono + ritmo) y no
 * un ranking que se recalcula.
 *
 * Incluye:
 *   · «Voz única» — genera una variedad irrepetible dentro de rangos que
 *     siempre suenan bien, y la guarda en este dispositivo.
 *   · La línea del MOTOR: qué está sintetizando de verdad, con preferencia
 *     declarada por el 1.58-bit local (ver `motorPreferido`).
 */

import { useCallback, useEffect, useState } from "react";
import { Dices, Cpu, Volume2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { timbresDe, fijarTimbre, timbreActual, generarTimbreUnico, type Timbre } from "@/lib/aurora/timbres";
import { motorPreferido, type MotorVoz } from "@/lib/aurora/motor-voz";
import type { VoiceGender } from "@/lib/aurora/personalities";

export function SelectorTimbres({
    genero,
    onProbar,
}: {
    genero: VoiceGender;
    /** Reproduce una frase con el timbre recién fijado. */
    onProbar: () => void;
}) {
    const [lista, setLista] = useState<Timbre[]>([]);
    const [activo, setActivo] = useState<string>("");
    const [motor, setMotor] = useState<MotorVoz | null>(null);

    const refrescar = useCallback(() => {
        setLista(timbresDe(genero));
        setActivo(timbreActual(genero).id);
    }, [genero]);

    useEffect(() => { refrescar(); }, [refrescar]);
    useEffect(() => { void motorPreferido().then(setMotor).catch(() => setMotor(null)); }, []);

    const elegir = useCallback((t: Timbre) => {
        fijarTimbre(t.id);
        setActivo(t.id);
        onProbar();
    }, [onProbar]);

    const generar = useCallback(() => {
        const t = generarTimbreUnico(genero);
        setLista(timbresDe(genero));
        elegir(t);
    }, [genero, elegir]);

    return (
        <div className="space-y-2.5">
            <p className="text-center text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/35">
                Variedades
            </p>

            <div className="grid gap-1.5 sm:grid-cols-2">
                {lista.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => elegir(t)}
                        aria-pressed={activo === t.id}
                        className={cn(
                            "group flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors",
                            activo === t.id
                                ? "border-fuchsia-400/60 bg-fuchsia-500/[0.12]"
                                : "border-white/10 bg-white/[0.03] hover:border-fuchsia-400/35",
                        )}
                    >
                        <span className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                            activo === t.id ? "border-fuchsia-400/50 bg-fuchsia-500/20" : "border-white/10 bg-white/[0.04]",
                        )}>
                            {activo === t.id
                                ? <Check className="h-3 w-3 text-fuchsia-200" aria-hidden />
                                : <Volume2 className="h-3 w-3 text-white/40" aria-hidden />}
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[12px] font-semibold leading-tight">{t.nombre}</span>
                            <span className="block truncate text-[10.5px] text-white/50">{t.desc}</span>
                        </span>
                    </button>
                ))}
            </div>

            <div className="flex justify-center">
                <button
                    type="button"
                    onClick={generar}
                    className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/35 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-100 transition-colors hover:border-cyan-400/60 hover:bg-cyan-500/20"
                    title="Crea una variedad irrepetible y la guarda en este dispositivo"
                >
                    <Dices className="h-3.5 w-3.5" aria-hidden /> Generar voz única
                </button>
            </div>

            {/* Qué está sintetizando de verdad. Sin promesas: lo que hay. */}
            {motor && (
                <p className="flex items-start justify-center gap-1.5 text-center text-[10.5px] leading-snug text-white/45">
                    <Cpu className="mt-px h-3 w-3 shrink-0 text-cyan-300/70" aria-hidden />
                    <span>
                        Motor: <b className="text-white/70">{motor.nombre}</b>. {motor.nota}
                    </span>
                </p>
            )}
        </div>
    );
}

export default SelectorTimbres;
