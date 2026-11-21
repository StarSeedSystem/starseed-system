"use client";

/**
 * TU18b-d1 (TRA1116-APP-F1) · Panel de conversación: dos mitades de pantalla,
 * micrófono por persona, turnos y latencias. Máquina de TU15 por props.
 */
import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, Loader2, RotateCcw, Keyboard } from "lucide-react";
import {
    procesarEvento,
    estadoInicial,
    type EstadoConversacion,
    type EventoConversacion,
    type DependenciasConversacion,
    type TurnoCompleto,
    type Hablante,
} from "@/lib/traductor/conversacion";
import type { ResultadoReconocimiento, ErrorReconocimiento } from "@/lib/traductor/voz-escucha";

export interface PanelConversacionProps {
    deps: DependenciasConversacion;
    girarB?: boolean;
}

const ETIQUETAS_ESTADO: Record<EstadoConversacion["fase"], string> = {
    inactivo: "Listo",
    escuchando: "Escuchando…",
    traduciendo: "Traduciendo…",
    hablando: "Hablando…",
    esperandoTurno: "Turno en cola…",
};

const ETIQUETAS_HABLANTE: Record<Hablante, string> = {
    A: "Persona A",
    B: "Persona B",
};

const IDIOMAS_HABLANTE: Record<Hablante, { codigo: string; nombre: string }> = {
    A: { codigo: "es", nombre: "Español" },
    B: { codigo: "en", nombre: "Inglés" },
};

function formatearMs(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}

export function PanelConversacion({ deps, girarB = false }: PanelConversacionProps) {
    const [estado, setEstado] = useState<EstadoConversacion>(estadoInicial());
    const [turnos, setTurnos] = useState<TurnoCompleto[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [textoEscrito, setTextoEscrito] = useState<Record<Hablante, string>>({ A: "", B: "" });
    const [mostrarEscritura, setMostrarEscritura] = useState<Record<Hablante, boolean>>({ A: false, B: false });

    const dispReconocimientoA = deps.reconocimiento.disponible(deps.parIdiomas("A").origen);
    const dispReconocimientoB = deps.reconocimiento.disponible(deps.parIdiomas("B").origen);
    const dispVozA = deps.voz.disponible(deps.parIdiomas("A").destino);
    const dispVozB = deps.voz.disponible(deps.parIdiomas("B").destino);

    const hayReconocimiento = dispReconocimientoA.ok && dispReconocimientoB.ok;
    const hayVoz = dispVozA.ok && dispVozB.ok;

    const audioSaleDelAparato = dispReconocimientoA.audioSaleDelAparato || dispReconocimientoB.audioSaleDelAparato;

    useEffect(() => {
        if (!hayReconocimiento || !hayVoz) {
            setMostrarEscritura({ A: !dispReconocimientoA.ok || !dispVozA.ok, B: !dispReconocimientoB.ok || !dispVozB.ok });
        }
    }, [hayReconocimiento, hayVoz, dispReconocimientoA.ok, dispReconocimientoB.ok, dispVozA.ok, dispVozB.ok]);

    const ejecutarEfectos = (efectos: ReturnType<typeof procesarEvento>["efectos"]) => {
        for (const efecto of efectos) {
            switch (efecto.tipo) {
                case "iniciarReconocimiento":
                    deps.reconocimiento.iniciar(efecto.idioma, {
                        alResultado: (r: ResultadoReconocimiento) => {
                            if (r.provisional) {
                                manejarEvento({ tipo: "resultadoParcial", texto: r.texto });
                            } else {
                                manejarEvento({ tipo: "resultadoFinal", texto: r.texto });
                            }
                        },
                        alError: (err: ErrorReconocimiento, mensaje: string) => {
                            manejarEvento({ tipo: "error", motivo: mensaje, contexto: "reconocimiento" });
                        },
                    });
                    break;
                case "detenerReconocimiento":
                    deps.reconocimiento.detener();
                    break;
                case "traducir":
                    deps.traducir(efecto.texto, efecto.par)
                        .then((r) => manejarEvento({ tipo: "traduccionLista", resultado: r }))
                        .catch((e) => manejarEvento({ tipo: "error", motivo: String(e), contexto: "traduccion" }));
                    break;
                case "hablar":
                    const ok = deps.voz.hablar(efecto.texto, efecto.idioma);
                    if (!ok.ok) {
                        manejarEvento({ tipo: "error", motivo: ok.motivo ?? "Error de voz", contexto: "voz" });
                    } else {
                        deps.voz.cuandoTermine((terminoOk) => {
                            if (!terminoOk) {
                                manejarEvento({ tipo: "error", motivo: "Voz interrumpida", contexto: "voz" });
                            } else {
                                manejarEvento({ tipo: "finDeVoz" });
                            }
                        });
                    }
                    break;
                case "detenerVoz":
                    deps.voz.detener();
                    break;
                case "emitirTurno":
                    setTurnos((t) => [efecto.turno, ...t].slice(0, 20));
                    break;
                case "emitirError":
                    setError(efecto.mensaje);
                    setTimeout(() => setError(null), 5000);
                    break;
            }
        }
    };

    const manejarEvento = (evento: EventoConversacion) => {
        const resultado = procesarEvento(estado, evento, deps);
        setEstado(resultado.estado);
        ejecutarEfectos(resultado.efectos);
    };

    const pulsarHablar = (quien: Hablante) => {
        if (mostrarEscritura[quien]) {
            const texto = textoEscrito[quien].trim();
            if (!texto) return;
            setTextoEscrito((prev) => ({ ...prev, [quien]: "" }));
            manejarEvento({ tipo: "resultadoFinal", texto });
            return;
        }
        manejarEvento({ tipo: "pulsarHablar", quien });
    };

    const alEscribir = (quien: Hablante, texto: string) => {
        setTextoEscrito((prev) => ({ ...prev, [quien]: texto }));
    };

    const mitadA = (
        <MitadPanel
            quien="A"
            estado={estado}
            turnos={turnos}
            textoEscrito={textoEscrito.A}
            mostrarEscritura={mostrarEscritura.A}
            dispReconocimiento={{ ...dispReconocimientoA, audioSaleDelAparato: dispReconocimientoA.audioSaleDelAparato }}
            dispVoz={dispVozA}
            onPulsarHablar={pulsarHablar}
            onEscribir={alEscribir}
        />
    );

    const mitadB = (
        <MitadPanel
            quien="B"
            estado={estado}
            turnos={turnos}
            textoEscrito={textoEscrito.B}
            mostrarEscritura={mostrarEscritura.B}
            dispReconocimiento={{ ...dispReconocimientoB, audioSaleDelAparato: dispReconocimientoB.audioSaleDelAparato }}
            dispVoz={dispVozB}
            onPulsarHablar={pulsarHablar}
            onEscribir={alEscribir}
            girada
        />
    );

    return (
        <section aria-label="Conversación traducida" className="flex h-full min-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-black/70 p-4 text-white shadow-2xl backdrop-blur-xl">
            <header className="mb-4 flex flex-col gap-1">
                <h2 className="text-lg font-semibold">Conversación</h2>
                <p className="text-xs text-white/60">Dos mitades, un micrófono cada una. Turnos alternados con latencias reales.</p>
            </header>

            <div className="flex-1 flex flex-col overflow-hidden gap-4" role="region" aria-label="Área de conversación">
                {mitadA}
                {mitadB}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-white/60">
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

            {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
        </section>
    );
}

interface MitadPanelProps {
    quien: Hablante;
    estado: EstadoConversacion;
    turnos: TurnoCompleto[];
    textoEscrito: string;
    mostrarEscritura: boolean;
    dispReconocimiento: { ok: boolean; motivo?: string; audioSaleDelAparato: boolean };
    dispVoz: { ok: boolean; motivo?: string };
    onPulsarHablar: (quien: Hablante) => void;
    onEscribir: (quien: Hablante, texto: string) => void;
    girada?: boolean;
}

function MitadPanel({
    quien,
    estado,
    turnos,
    textoEscrito,
    mostrarEscritura,
    dispReconocimiento,
    dispVoz,
    onPulsarHablar,
    onEscribir,
    girada = false,
}: MitadPanelProps) {
    const esMiTurno = estado.fase !== "inactivo" && "quien" in estado && estado.quien === quien;
    const esMiEstado = esMiTurno && ["escuchando", "traduciendo", "hablando"].includes(estado.fase);

    const msActuales = esMiEstado && "inicioMs" in estado
        ? Date.now() - estado.inicioMs
        : 0;

    const msParciales = esMiEstado && estado.fase === "escuchando" && "parcial" in estado
        ? estado.parcial
        : null;

    const turnosDeQuien = turnos.filter((t) => t.quien === quien);
    const ultimoTurno = turnosDeQuien[0];

    const estiloGirada = girada ? { transform: "rotate(180deg)" } : {};

    return (
        <div
            data-testid={`mitad-${quien.toLowerCase()}`}
            className={`flex-1 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 ${girada ? "rotate-180" : ""}`}
            style={estiloGirada}
        >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-white/70 uppercase tracking-wide">{ETIQUETAS_HABLANTE[quien]}</span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/80">
                        {IDIOMAS_HABLANTE[quien].nombre}
                    </span>
                </div>
                {esMiEstado && (
                    <span className="text-xs text-cyan-300 font-mono tabular-nums">
                        {formatearMs(msActuales)}
                    </span>
                )}
            </div>

            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
                {mostrarEscritura ? (
                    <div className="flex flex-col gap-2 flex-1">
                        <label htmlFor={`turno-escrito-${quien}`} className="text-sm font-medium text-white/80">
                            Escribe tu turno
                        </label>
                        <textarea
                            id={`turno-escrito-${quien}`}
                            data-testid={`turno-escrito-${quien}`}
                            value={textoEscrito}
                            onChange={(e) => onEscribir(quien, e.target.value)}
                            rows={3}
                            placeholder={`Escribe lo que dice ${ETIQUETAS_HABLANTE[quien]}…`}
                            className="w-full rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-cyan-300"
                        />
                        <button
                            type="button"
                            onClick={() => onPulsarHablar(quien)}
                            disabled={!textoEscrito.trim()}
                            className="min-h-[44px] cursor-pointer rounded-xl bg-trinity-azure px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Enviar turno
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            type="button"
                            data-testid={`boton-mic-${quien}`}
                            role="button"
                            aria-label={`Micrófono ${ETIQUETAS_HABLANTE[quien]}`}
                            onClick={() => onPulsarHablar(quien)}
                            disabled={!dispReconocimiento.ok || !dispVoz.ok || esMiTurno}
                            className={`relative flex min-h-[120px] flex-1 cursor-pointer items-center justify-center gap-4 rounded-2xl border-2 transition-all ${
                                dispReconocimiento.ok && dispVoz.ok
                                    ? "border-cyan-400/50 bg-cyan-400/10 hover:bg-cyan-400/20"
                                    : "border-white/10 bg-white/5 cursor-not-allowed opacity-50"
                            }`}
                        >
                            <div className="flex flex-col items-center gap-2">
                                {esMiEstado && estado.fase === "escuchando" ? (
                                    <>
                                        <Mic className="h-16 w-16 text-cyan-300 animate-pulse" aria-hidden />
                                        <span className="text-lg font-semibold text-cyan-300">Escuchando…</span>
                                    </>
                                ) : esMiEstado && estado.fase === "traduciendo" ? (
                                    <>
                                        <Loader2 className="h-16 w-16 text-cyan-300 animate-spin" aria-hidden />
                                        <span className="text-lg font-semibold text-cyan-300">Traduciendo…</span>
                                    </>
                                ) : esMiEstado && estado.fase === "hablando" ? (
                                    <>
                                        <Volume2 className="h-16 w-16 text-cyan-300 animate-pulse" aria-hidden />
                                        <span className="text-lg font-semibold text-cyan-300">Hablando…</span>
                                    </>
                                ) : (
                                    <>
                                        <Mic className="h-16 w-16 text-white/60" aria-hidden />
                                        <span className="text-lg font-semibold text-white/80">Pulsa para hablar</span>
                                    </>
                                )}
                                {!dispReconocimiento.ok && (
                                    <span className="text-xs text-amber-300 text-center max-w-[200px]">
                                        {dispReconocimiento.motivo ?? "Sin reconocimiento"}
                                    </span>
                                )}
                                {!dispVoz.ok && (
                                    <span className="text-xs text-amber-300 text-center max-w-[200px]">
                                        {dispVoz.motivo ?? "Sin voz"}
                                    </span>
                                )}
                            </div>
                        </button>

                        {msParciales && (
                            <p className="text-sm text-white/70 text-center font-mono" aria-live="polite">
                                "{msParciales}"
                            </p>
                        )}
                    </>
                )}

                {ultimoTurno && (
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
                )}
            </div>
        </div>
    );
}