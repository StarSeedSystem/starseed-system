"use client";

/**
 * TU18 (TRA1116-APP-F1) · Panel de conversación en dos mitades.
 * Presenta el estado de la máquina de turnos de `conversacion.ts`: una mitad por
 * persona, con idioma, micrófono, último turno (original y traducción) y las
 * latencias reales. No habla, no reconoce ni traduce: avisa por props. Sin
 * reconocimiento o sin voz, ese lado ofrece escribir el turno.
 */
import { Keyboard, Mic, MicOff } from "lucide-react";
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

/** Latencia real en milisegundos; «—» cuando el dato no existe. Pura. */
export function formatearMs(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "—";
    return `${Math.round(ms)} ms`;
}
/** Estado legible de un lado según la fase activa de la máquina. Pura. */
export function estadoDeLado(estado: EstadoConversacion, quien: Hablante): string {
    if (estado.fase === "inactivo") return "Listo";
    if (estado.quien !== quien) return "En espera";
    switch (estado.fase) {
        case "escuchando":
            return estado.parcial ? `Escuchando: ${estado.parcial}` : "Escuchando…";
        case "traduciendo":
            return "Traduciendo…";
        case "hablando":
            return "Hablando…";
        case "esperandoTurno":
            return `Esperando turno (${estado.cola.length})`;
    }
}
interface MitadProps {
    quien: Hablante;
    idioma: string;
    reconocimiento: boolean;
    voz: boolean;
    estado: EstadoConversacion;
    turno: TurnoCompleto | null;
    girar: boolean;
    onPulsarHablar: (quien: Hablante) => void;
    onEscribir: (quien: Hablante) => void;
}

function Mitad({ quien, idioma, reconocimiento, voz, estado, turno, girar, onPulsarHablar, onEscribir }: MitadProps) {
    return (
        <section aria-label={`Lado ${quien} · ${idioma}`} className={`flex flex-1 flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-5 ${girar ? "rotate-180" : ""}`}>
            <div className="flex items-center justify-between gap-2">
                <div>
                    <p className="text-xs uppercase tracking-wide text-white/50">Persona {quien}</p>
                    <p className="font-semibold text-white" translate="no">{idioma}</p>
                </div>
                <button type="button" disabled={!reconocimiento} onClick={() => onPulsarHablar(quien)}
                    aria-label={reconocimiento ? `Hablar en ${idioma}` : `Micrófono no disponible en ${idioma}`}
                    className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border text-white transition-colors ${reconocimiento ? "cursor-pointer border-cyan-300/40 bg-cyan-500/20 hover:bg-cyan-500/30" : "cursor-not-allowed border-white/10 bg-white/5 text-white/40"}`}>
                    {reconocimiento ? <Mic className="h-7 w-7" aria-hidden /> : <MicOff className="h-7 w-7" aria-hidden />}
                </button>
            </div>
            <p role="status" className="text-sm text-cyan-200">{estadoDeLado(estado, quien)}</p>
            {turno ? (
                <div className="flex flex-col gap-1">
                    <p className="text-sm text-white/70">{turno.texto}</p>
                    <p className="text-base text-white">{turno.traduccion}</p>
                    <p className="text-[11px] text-white/50">
                        Reconocido {formatearMs(turno.msReconocer)} · Traducido {formatearMs(turno.msTraducir)} · Hablado {formatearMs(turno.msHablar)}
                    </p>
                </div>
            ) : (
                <p className="text-sm text-white/50">Aún no hay turnos en este lado.</p>
            )}
            {(!reconocimiento || !voz) && (
                <div className="mt-auto flex flex-col gap-2">
                    <p className="text-xs text-amber-200">
                        {!reconocimiento ? "Sin reconocimiento de voz para este idioma." : "Sin voz de salida para este idioma."}
                    </p>
                    <button type="button" onClick={() => onEscribir(quien)}
                        className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white hover:bg-white/10">
                        <Keyboard className="h-4 w-4" aria-hidden /> Escribir el turno
                    </button>
                </div>
            )}
        </section>
    );
}

export function PanelConversacion({
    estado, turnos, idiomaA, idiomaB, reconocimientoA, reconocimientoB, vozA, vozB,
    audioSaleDelAparato, girarB = false, onPulsarHablar, onEscribir,
}: PanelConversacionProps) {
    const ultimoDe = (quien: Hablante): TurnoCompleto | null =>
        turnos.filter((t) => t.quien === quien).slice(-1)[0] ?? null;
    return (
        <div className="flex flex-col gap-3" data-testid="panel-conversacion">
            <p role="note" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-100">
                La traducción en tiempo real no es simultánea: cada turno espera a que el otro lado termine.
                {audioSaleDelAparato ? " El audio se sintetiza fuera de este aparato." : " El audio se sintetiza en este aparato."}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
                <Mitad quien="A" idioma={idiomaA} reconocimiento={reconocimientoA} voz={vozA} estado={estado} turno={ultimoDe("A")} girar={false} onPulsarHablar={onPulsarHablar} onEscribir={onEscribir} />
                <Mitad quien="B" idioma={idiomaB} reconocimiento={reconocimientoB} voz={vozB} estado={estado} turno={ultimoDe("B")} girar={girarB} onPulsarHablar={onPulsarHablar} onEscribir={onEscribir} />
            </div>
        </div>
    );
}
