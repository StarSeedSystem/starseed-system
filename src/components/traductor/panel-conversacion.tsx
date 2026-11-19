"use client";

/**
 * TU18b · Panel de conversación: pantalla dividida en dos mitades,
 * micrófono por persona, turnos con latencias y estado.
 * Máquina de TU15 por props.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Loader2, Volume2, AlertTriangle, RotateCcw, Keyboard } from "lucide-react";
import type {
    EstadoConversacion,
    TurnoCompleto,
    Hablante,
    DependenciasConversacion,
    EventoConversacion,
    ResultadoProcesar,
} from "@/lib/traductor/conversacion";
import { procesarEvento } from "@/lib/traductor/conversacion";
import type { ParIdiomas } from "@/lib/traductor/tipos";

export interface PanelConversacionProps {
    deps: DependenciasConversacion;
    audioSaleDelAparato: boolean;
    mitadBGirada?: boolean;
}

function MitadPanel({
    quien,
    estado,
    par,
    audioSaleDelAparato,
    girada,
    alPulsar,
    enEscucha,
    textoParcial,
    turnoActual,
    sinReconocimiento,
    motivoReconocimiento,
    alEscribir,
    alEnviarEscrito,
}: {
    quien: Hablante;
    estado: EstadoConversacion;
    par: ParIdiomas;
    audioSaleDelAparato: boolean;
    girada: boolean;
    alPulsar: (quien: Hablante) => void;
    enEscucha: boolean;
    textoParcial: string;
    turnoActual: TurnoCompleto | null;
    sinReconocimiento: boolean;
    motivoReconocimiento: string | null;
    alEscribir: (quien: Hablante, texto: string) => void;
    alEnviarEscrito: (quien: Hablante) => void;
}) {
    const etiquetaQuien = quien === "A" ? "Persona A" : "Persona B";
    const IconoMic = enEscucha ? MicOff : Mic;
    const colorEstado = estado.fase === "escuchando" ? "text-emerald-400" :
                       estado.fase === "traduciendo" ? "text-amber-400" :
                       estado.fase === "hablando" ? "text-cyan-400" : "text-white/60";
    const textoEstado = estado.fase === "escuchando" ? "Escuchando…" :
                       estado.fase === "traduciendo" ? "Traduciendo…" :
                       estado.fase === "hablando" ? "Hablando…" : "Esperando";

    return (
        <div
            data-testid={`mitad-${quien}`}
            className={`flex-1 flex flex-col gap-3 p-4 rounded-2xl border border-white/10 bg-white/5 min-h-[300px] ${girada ? "rotate-180" : ""}`}
            style={girada ? { transform: "rotate(180deg)" } : undefined}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">{etiquetaQuien}</span>
                    <span className="text-xs text-white/60 px-2 py-0.5 rounded-full bg-white/10">
                        {par.origen} → {par.destino}
                    </span>
                </div>
                <span className={`${colorEstado} text-sm font-medium`}>{textoEstado}</span>
            </div>

            {sinReconocimiento && (
                <div className="flex flex-col gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                        <span>Reconocimiento no disponible: {motivoReconocimiento}</span>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder={`Escribe lo que dice ${etiquetaQuien.toLowerCase()}`}
                            onChange={(e) => alEscribir(quien, e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") alEnviarEscrito(quien); }}
                            className="flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-cyan-300"
                        />
                        <button
                            type="button"
                            onClick={() => alEnviarEscrito(quien)}
                            className="min-h-[44px] cursor-pointer rounded-xl bg-trinity-azure px-4 text-sm font-semibold text-white hover:opacity-90"
                        >
                            Enviar
                        </button>
                    </div>
                </div>
            )}

            {!sinReconocimiento && (
                <button
                    type="button"
                    onClick={() => alPulsar(quien)}
                    disabled={enEscucha}
                    aria-label={`Micrófono ${etiquetaQuien}`}
                    data-testid={`boton-mic-${quien.toLowerCase()}`}
                    className={`flex min-h-[56px] w-full cursor-pointer items-center justify-center gap-3 rounded-xl border transition-colors ${
                        enEscucha
                            ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                            : "bg-white/5 border-white/15 text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
                    }`}
                >
                    <IconoMic className="h-8 w-8 shrink-0" aria-hidden />
                    <span className="text-lg font-medium">{enEscucha ? "Escuchando…" : "Pulsa para hablar"}</span>
                    {enEscucha && <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden />}
                </button>
            )}

            {textoParcial && (
                <div className="text-sm text-white/70 italic" aria-live="polite">
                    {textoParcial}
                </div>
            )}

            {turnoActual && (
                <div className="flex flex-col gap-2 text-sm text-white/80">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center gap-2 text-xs text-white/60 mb-1">
                            <span>Original ({par.origen}):</span>
                        </div>
                        <p className="text-white">{turnoActual.texto}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <div className="flex items-center gap-2 text-xs text-white/60 mb-1">
                            <span>Traducido ({par.destino}):</span>
                        </div>
                        <p className="text-white">{turnoActual.traduccion}</p>
                    </div>
                    <div className="flex gap-4 text-xs text-white/50">
                        <span>Reconocer: {turnoActual.msReconocer} ms</span>
                        <span>Traducir: {turnoActual.msTraducir} ms</span>
                        <span>Hablar: {turnoActual.msHablar} ms</span>
                    </div>
                </div>
            )}

            {!turnoActual && !textoParcial && !enEscucha && !sinReconocimiento && (
                <p className="text-xs text-white/40 text-center py-4">Pulsa el micrófono para empezar</p>
            )}
        </div>
    );
}

export function PanelConversacion({ deps, audioSaleDelAparato, mitadBGirada = false }: PanelConversacionProps) {
    const [estado, setEstado] = useState<EstadoConversacion>({ fase: "inactivo" });
    const [turnos, setTurnos] = useState<TurnoCompleto[]>([]);
    const [textoParcial, setTextoParcial] = useState("");
    const [turnoActual, setTurnoActual] = useState<TurnoCompleto | null>(null);
    const [textosEscritos, setTextosEscritos] = useState<Record<Hablante, string>>({ A: "", B: "" });
    const procesandoRef = useRef(false);
    const colaEfectosRef = useRef<Array<{ tipo: string; [key: string]: unknown }>>([]);

    const parA = deps.parIdiomas("A");
    const parB = deps.parIdiomas("B");

    const dispRecA = deps.reconocimiento.disponible(parA.origen);
    const dispRecB = deps.reconocimiento.disponible(parB.origen);
    const sinReconocimientoA = !dispRecA.ok;
    const sinReconocimientoB = !dispRecB.ok;
    const motivoRecA = dispRecA.motivo ?? null;
    const motivoRecB = dispRecB.motivo ?? null;

    const enEscuchaA = estado.fase === "escuchando" && estado.quien === "A";
    const enEscuchaB = estado.fase === "escuchando" && estado.quien === "B";

    const procesarEfectos = useCallback(async (efectos: Array<{ tipo: string; [key: string]: unknown }>) => {
        for (const efecto of efectos) {
            switch (efecto.tipo) {
                case "iniciarReconocimiento":
                    deps.reconocimiento.iniciar(efecto.idioma as string, {
                        alResultado: (r) => {
                            if (r.provisional) {
                                setTextoParcial(r.texto);
                            } else {
                                setTextoParcial("");
                                const evento: EventoConversacion = { tipo: "resultadoFinal", texto: r.texto };
                                const resultado = procesarEvento(estado, evento, deps);
                                setEstado(resultado.estado);
                                procesarEfectos(resultado.efectos);
                            }
                        },
                        alError: (error, mensaje) => {
                            setTextoParcial("");
                            const evento: EventoConversacion = { tipo: "error", motivo: mensaje, contexto: "reconocimiento" };
                            const resultado = procesarEvento(estado, evento, deps);
                            setEstado(resultado.estado);
                            procesarEfectos(resultado.efectos);
                        },
                    });
                    break;
                case "detenerReconocimiento":
                    deps.reconocimiento.detener();
                    break;
                case "traducir":
                    try {
                        const resultado = await deps.traducir(efecto.texto as string, efecto.par as ParIdiomas);
                        const evento: EventoConversacion = { tipo: "traduccionLista", resultado };
                        const res = procesarEvento(estado, evento, deps);
                        setEstado(res.estado);
                        procesarEfectos(res.efectos);
                    } catch (e) {
                        const mensaje = e instanceof Error ? e.message : String(e);
                        const evento: EventoConversacion = { tipo: "error", motivo: mensaje, contexto: "traduccion" };
                        const res = procesarEvento(estado, evento, deps);
                        setEstado(res.estado);
                        procesarEfectos(res.efectos);
                    }
                    break;
                case "hablar":
                    deps.voz.hablar(efecto.texto as string, efecto.idioma as string);
                    deps.voz.cuandoTermine((ok) => {
                        const evento: EventoConversacion = { tipo: "finDeVoz" };
                        const res = procesarEvento(estado, evento, deps);
                        setEstado(res.estado);
                        procesarEfectos(res.efectos);
                    });
                    break;
                case "detenerVoz":
                    deps.voz.detener();
                    break;
                case "emitirTurno":
                    const turno = efecto.turno as TurnoCompleto;
                    setTurnos((t) => [turno, ...t.slice(0, 19)]);
                    setTurnoActual(turno);
                    break;
                case "emitirError":
                    console.error("Error conversación:", efecto.mensaje);
                    break;
            }
        }
    }, [deps, estado]);

    const alPulsar = useCallback((quien: Hablante) => {
        if (procesandoRef.current) return;
        procesandoRef.current = true;

        const evento: EventoConversacion = { tipo: "pulsarHablar", quien };
        const resultado = procesarEvento(estado, evento, deps);
        setEstado(resultado.estado);
        procesarEfectos(resultado.efectos);

        procesandoRef.current = false;
    }, [deps, estado, procesarEfectos]);

    const alEscribir = useCallback((quien: Hablante, texto: string) => {
        setTextosEscritos((prev) => ({ ...prev, [quien]: texto }));
    }, []);

    const alEnviarEscrito = useCallback((quien: Hablante) => {
        const texto = textosEscritos[quien];
        if (!texto.trim()) return;
        setTextosEscritos((prev) => ({ ...prev, [quien]: "" }));
        // Simular resultadoFinal del reconocimiento con el texto escrito
        const evento: EventoConversacion = { tipo: "resultadoFinal", texto };
        const resultado = procesarEvento(estado, evento, deps);
        setEstado(resultado.estado);
        procesarEfectos(resultado.efectos);
    }, [textosEscritos, estado, deps, procesarEfectos]);

    useEffect(() => {
        if (textosEscritos.A && estado.fase === "inactivo") {
            const evento: EventoConversacion = { tipo: "pulsarHablar", quien: "A" };
            const resultado = procesarEvento(estado, evento, deps);
            setEstado(resultado.estado);
            procesarEfectos(resultado.efectos);
        }
        if (textosEscritos.B && estado.fase === "inactivo") {
            const evento: EventoConversacion = { tipo: "pulsarHablar", quien: "B" };
            const resultado = procesarEvento(estado, evento, deps);
            setEstado(resultado.estado);
            procesarEfectos(resultado.efectos);
        }
    }, [textosEscritos, estado.fase, deps, procesarEfectos]);

    return (
        <section aria-label="Conversación bidireccional" className="flex flex-col gap-4">
            <header className="flex flex-col gap-2">
                <h2 className="text-base font-semibold text-white">Conversación</h2>
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                    <span className="flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" aria-hidden />
                        La traducción en tiempo real no es simultánea: hay latencia entre hablar, reconocer, traducir y escuchar.
                    </span>
                    <span className="flex items-center gap-1">
                        <Volume2 className="h-3 w-3" aria-hidden />
                        {audioSaleDelAparato ? "El audio sale del aparato" : "El audio no sale del aparato"}
                    </span>
                </div>
            </header>

            <div className="flex gap-4" role="group" aria-label="Dos participantes">
                <MitadPanel
                    quien="A"
                    estado={estado}
                    par={parA}
                    audioSaleDelAparato={audioSaleDelAparato}
                    girada={false}
                    alPulsar={alPulsar}
                    enEscucha={enEscuchaA}
                    textoParcial={enEscuchaA ? textoParcial : ""}
                    turnoActual={turnoActual?.quien === "A" ? turnoActual : turnos.find((t) => t.quien === "A") ?? null}
                    sinReconocimiento={sinReconocimientoA}
                    motivoReconocimiento={motivoRecA}
                    alEscribir={alEscribir}
                    alEnviarEscrito={alEnviarEscrito}
                />
                <MitadPanel
                    quien="B"
                    estado={estado}
                    par={parB}
                    audioSaleDelAparato={audioSaleDelAparato}
                    girada={mitadBGirada}
                    alPulsar={alPulsar}
                    enEscucha={enEscuchaB}
                    textoParcial={enEscuchaB ? textoParcial : ""}
                    turnoActual={turnoActual?.quien === "B" ? turnoActual : turnos.find((t) => t.quien === "B") ?? null}
                    sinReconocimiento={sinReconocimientoB}
                    motivoReconocimiento={motivoRecB}
                    alEscribir={alEscribir}
                    alEnviarEscrito={alEnviarEscrito}
                />
            </div>
        </section>
    );
}