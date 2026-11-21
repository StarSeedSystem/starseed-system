"use client";

/**
 * TU18 (TRA1116-APP-F1) · Panel de conversación en dos mitades.
 * Presenta el estado de la máquina de turnos de `conversacion.ts`: una mitad por
 * persona, con idioma, micrófono, último turno (original y traducción) y las
 * latencias reales. No habla, no reconoce ni traduce: avisa por props. Sin
 * reconocimiento o sin voz, ese lado ofrece escribir el turno.
 */
import { Mic, MicOff } from "lucide-react";
import type { EstadoConversacion, Hablante, TurnoCompleto } from "@/lib/traductor/conversacion";

export interface PanelConversacionProps {
    estado: EstadoConversacion;
    turnos: readonly TurnoCompleto[];
    idiomaA: string;
    idiomaB: string;
    reconocimientoA: boolean;
    reconocimientoB: boolean;
    vozA: boolean;
    vozB: boolean;
    audioSaleDelAparato: boolean;
    girarB?: boolean;
    onPulsarHablar: (quien: Hablante) => void;
    onEscribir: (quien: Hablante) => void;
}

const ETIQUETAS_HABLANTE: Record<Hablante, string> = {
    A: "Persona A",
    B: "Persona B",
};

const IDIOMAS_HABLANTE: Record<Hablante, { codigo: string; nombre: string }> = {
    A: { codigo: "es", nombre: "Español" },
    B: { codigo: "en", nombre: "Inglés" },
};

const ETIQUETAS_ESTADO: Record<NonNullable<EstadoConversacion["fase"]>, string> = {
    inactivo: "inactivo",
    escuchando: "Escuchando",
    traduciendo: "Traduciendo",
    hablando: "Hablando",
    esperandoTurno: "Esperando turno",
};

/** Latencia real en milisegundos; «—» cuando el dato no existe. */
export function formatearMs(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    return `${Math.round(ms)} ms`;
}

/** Estado legible por lado: muestra la fase del hablante actual y su texto parcial si hay. */
export function estadoDeLado(estado: EstadoConversacion, quien: Hablante): string {
    if (estado.fase === "inactivo") return "Listo";
    if ("quien" in estado && estado.quien === quien) {
        const fase = estado.fase;
        const texto = fase === "escuchando" && "parcial" in estado && estado.parcial
            ? ` (${estado.parcial})`
            : "";
        return `${ETIQUETAS_ESTADO[fase]}${texto}`;
    }
    return "En espera";
}

export function PanelConversacion({
    estado,
    turnos,
    idiomaA,
    idiomaB,
    reconocimientoA,
    reconocimientoB,
    vozA,
    vozB,
    audioSaleDelAparato,
    girarB = false,
    onPulsarHablar,
    onEscribir,
}: PanelConversacionProps) {
    const turnosA = turnos.filter((t) => t.quien === "A");
    const turnoB = turnos.filter((t) => t.quien === "B");
    const ultimoTurnoA = turnosA[0];
    const ultimoTurnoB = turnoB[0];

    return (
        <section className="flex h-full min-h-[calc(100dvh-1rem)] w-full flex-col gap-4">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold">Conversación traducida</h1>
                <p className="text-xs text-white/60">Dos mitades, un micrófono por persona. Turnos alternados con latencias reales.</p>
            </header>

            <div className="flex-1 flex gap-4" role="region" aria-label="Área de conversación">
                <MitadPanel
                    quien="A"
                    estado={estado}
                    turnos={ultimoTurnoA ? [ultimoTurnoA] : []}
                    idioma={idiomaA}
                    idiomaNombre="Español"
                    idiomaDelOponente={idiomaB}
                    reconocimientoOk={reconocimientoA}
                    vozOk={vozA}
                    onPulsarHablar={onPulsarHablar}
                    onEscribir={onEscribir}
                />
                <MitadPanel
                    quien="B"
                    estado={estado}
                    turnos={ultimoTurnoB ? [ultimoTurnoB] : []}
                    idioma={idiomaB}
                    idiomaNombre="Inglés"
                    idiomaDelOponente={idiomaA}
                    reconocimientoOk={reconocimientoB}
                    vozOk={vozB}
                    onPulsarHablar={onPulsarHablar}
                    onEscribir={onEscribir}
                    girada={girarB}
                />
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                <span className="flex items-center gap-1">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/10">⚠</span>
                    La traducción en tiempo real no es simultánea.
                </span>
                <span className="flex items-center gap-1">
                    {audioSaleDelAparato ? (
                        <>
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/10">🔊</span>
                            El audio sale del aparato.
                        </>
                    ) : (
                        <>
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-white/10">🔇</span>
                            El audio no sale del aparato.
                        </>
                    )}
                </span>
            </div>
        </section>
    );
}

interface MitadPanelProps {
    quien: Hablante;
    estado: EstadoConversacion;
    turnos: TurnoCompleto[];
    idioma: string;
    idiomaNombre: string;
    idiomaDelOponente: string;
    reconocimientoOk: boolean;
    vozOk: boolean;
    onPulsarHablar: (quien: Hablante) => void;
    onEscribir: (quien: Hablante) => void;
    girada?: boolean;
}

function MitadPanel({
    quien,
    estado,
    turnos,
    idioma,
    idiomaNombre,
    idiomaDelOponente,
    reconocimientoOk,
    vozOk,
    onPulsarHablar,
    onEscribir,
    girada = false,
}: MitadPanelProps) {
    const ultimoTurno = turnos[0];

    return (
        <div
            data-testid={`mitad-${quien.toLowerCase()}`}
            className={`flex-1 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4`}
            style={{ transform: girada ? "rotate(180deg)" : undefined }}
            role="region"
            aria-label={`Lado ${ETIQUETAS_HABLANTE[quien]}`}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white/70 uppercase tracking-wide">
                        {ETIQUETAS_HABLANTE[quien]}
                    </span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/80">
                        {idiomaNombre}
                    </span>
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                {ultimoTurno ? (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                        <div className="flex items-center gap-2 text-xs text-white/60 mb-2">
                            <span className="font-medium">{ETIQUETAS_HABLANTE[ultimoTurno.quien]}</span>
                            <span>·</span>
                            <span>Rec: {formatearMs(ultimoTurno.msReconocer)}</span>
                            <span>·</span>
                            <span>Trad: {formatearMs(ultimoTurno.msTraducir)}</span>
                            <span>·</span>
                            <span>Voz: {formatearMs(ultimoTurno.msHablar)}</span>
                        </div>
                        <div className="text-white/80 mb-1">{ultimoTurno.texto}</div>
                        <div className="text-cyan-300">{ultimoTurno.traduccion}</div>
                    </div>
                ) : (
                    <>
                        {!reconocimientoOk && !vozOk ? (
                            <button
                                type="button"
                                data-testid={`boton-mic-${quien}`}
                                role="button"
                                aria-label={`Micrófono ${ETIQUETAS_HABLANTE[quien]}`}
                                onClick={() => onEscribir(quien)}
                                className="flex min-h-[120px] flex-1 cursor-pointer items-center justify-center gap-4 rounded-2xl border-2 border-white/10 bg-white/5 transition-all"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <MicOff className="h-16 w-16 text-white/60" aria-hidden />
                                    <span className="text-lg font-semibold text-white/80">
                                        Escribe tu turno
                                    </span>
                                    <span className="text-xs text-amber-300 text-center max-w-[200px]">
                                        Sin reconocimiento de voz para este idioma
                                    </span>
                                </div>
                            </button>
                        ) : !reconocimientoOk ? (
                            <button
                                type="button"
                                data-testid={`boton-mic-${quien}`}
                                role="button"
                                aria-label={`Micrófono ${ETIQUETAS_HABLANTE[quien]}`}
                                onClick={() => onEscribir(quien)}
                                className="flex min-h-[120px] flex-1 cursor-pointer items-center justify-center gap-4 rounded-2xl border-2 border-white/10 bg-white/5 transition-all"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <MicOff className="h-16 w-16 text-white/60" aria-hidden />
                                    <span className="text-lg font-semibold text-white/80">
                                        Escribe tu turno
                                    </span>
                                    <span className="text-xs text-amber-300 text-center max-w-[200px]">
                                        No hay micrófono disponible en {idiomaNombre}
                                    </span>
                                </div>
                            </button>
                        ) : !vozOk ? (
                            <button
                                type="button"
                                data-testid={`boton-mic-${quien}`}
                                role="button"
                                aria-label={`Micrófono ${ETIQUETAS_HABLANTE[quien]}`}
                                onClick={() => onEscribir(quien)}
                                className="flex min-h-[120px] flex-1 cursor-pointer items-center justify-center gap-4 rounded-2xl border-2 border-white/10 bg-white/5 transition-all"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <MicOff className="h-16 w-16 text-white/60" aria-hidden />
                                    <span className="text-lg font-semibold text-white/80">
                                        Escribe tu turno
                                    </span>
                                    <span className="text-xs text-amber-300 text-center max-w-[200px]">
                                        Sin voz de salida para este idioma
                                    </span>
                                </div>
                            </button>
                        ) : (
                            <button
                                type="button"
                                data-testid={`boton-mic-${quien}`}
                                role="button"
                                aria-label={`Micrófono ${ETIQUETAS_HABLANTE[quien]}`}
                                onClick={() => onPulsarHablar(quien)}
                                className="relative flex min-h-[120px] flex-1 cursor-pointer items-center justify-center gap-4 rounded-2xl border-2 border-cyan-400/50 bg-cyan-400/10 hover:bg-cyan-400/20 transition-all"
                            >
                                <div className="flex flex-col items-center gap-2">
                                    <Mic className="h-16 w-16 text-cyan-300" aria-hidden />
                                    <span className="text-lg font-semibold text-white/80">
                                        Hablar en {idiomaDelOponente}
                                    </span>
                                </div>
                            </button>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}