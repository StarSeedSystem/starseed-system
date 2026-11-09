"use client";

/**
 * «Ignorar» y «Silenciar…» de una llamada entrante (LLA1108F). Dos botones pequeños: «Ignorar» calla esta llamada sin
 * rechazarla (quien llama sigue oyendo el tono hasta que se acabe el tiempo); «Silenciar…» pregunta de quién (esta persona,
 * neurona, grupo, medio o todas) y por cuánto (15 min, 1 h, 8 h, hasta mañana, hasta que lo reactive).
 */
import { useState } from "react";
import { BellOff, EyeOff } from "lucide-react";
import { ambitosPara, ignorarEntrante, silenciarEntrante, type QuienLlama } from "@/lib/llamadas/nativa/acciones-timbre";
import { DURACIONES, TEXTO_AMBITO, TEXTO_DURACION, type AmbitoSilencio } from "@/lib/llamadas/silencio-llamadas";

const CLASE_BOTON = "ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white/90 transition-transform duration-200 hover:scale-[1.03]";

export function BotonesIgnorarSilenciar({ quien }: { quien: QuienLlama }) {
    const [abierto, setAbierto] = useState(false);
    const [ambito, setAmbito] = useState<AmbitoSilencio | null>(null);
    const ambitos = ambitosPara(quien);

    return (
        <div className="flex w-full flex-col gap-2" data-testid="ignorar-silenciar">
            <div className="flex flex-wrap items-center justify-end gap-2">
                <button type="button" onClick={() => ignorarEntrante(quien.id)} className={CLASE_BOTON} style={{ background: "rgba(255,255,255,.1)" }} aria-label={`Ignorar la llamada de ${quien.nombre}`}>
                    <EyeOff className="h-4 w-4" aria-hidden />
                    Ignorar
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setAbierto((a) => !a);
                        setAmbito(null);
                    }}
                    className={CLASE_BOTON}
                    style={{ background: "rgba(255,255,255,.1)" }}
                    aria-expanded={abierto}
                    aria-label="Silenciar llamadas como esta"
                >
                    <BellOff className="h-4 w-4" aria-hidden />
                    Silenciar…
                </button>
            </div>
            {abierto && (
                <div className="rounded-2xl p-2" style={{ background: "rgba(255,255,255,.07)" }} role="menu" aria-label="Silenciar llamadas">
                    {!ambito ? (
                        <>
                            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">Silenciar llamadas de…</p>
                            {ambitos.map((a) => (
                                <button key={a} type="button" role="menuitem" onClick={() => setAmbito(a)} className="block w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-white/90 hover:bg-white/10">
                                    {TEXTO_AMBITO[a]}
                                </button>
                            ))}
                        </>
                    ) : (
                        <>
                            <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/50">{TEXTO_AMBITO[ambito]} · ¿cuánto tiempo?</p>
                            {DURACIONES.map((d) => (
                                <button
                                    key={d}
                                    type="button"
                                    role="menuitem"
                                    onClick={() => {
                                        silenciarEntrante(quien, ambito, d);
                                        setAbierto(false);
                                    }}
                                    className="block w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-white/90 hover:bg-white/10"
                                >
                                    {TEXTO_DURACION[d]}
                                </button>
                            ))}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
