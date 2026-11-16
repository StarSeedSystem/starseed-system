"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX, RotateCcw, Keyboard, Send, AlertCircle, CheckCircle, Clock } from "lucide-react";
import type { EstadoConversacion, TurnoCompleto, Hablante, EventoConversacion, DependenciasConversacion, ParIdiomas } from "@/lib/traductor/conversacion";
import type { EstadoPar } from "@/lib/traductor/tipos";
import { intercambiarPar, type Par } from "./selector-par";
import { IDIOMAS, porCodigo } from "@/lib/idiomas/idiomas";

type EstadoVoz = "escuchando" | "traduciendo" | "hablando" | "inactivo";

interface MitadConfig {
    quien: Hablante;
    idioma: string;
    nombreIdioma: string;
    estado: EstadoVoz;
    textoOriginal: string;
    textoTraducido: string;
    parcial: string;
    msReconocer: number;
    msTraducir: number;
    msHablar: number;
    audioSaleDelAparato: boolean;
    hayVoz: boolean;
    hayReconocimiento: boolean;
    error?: string;
}

interface MaquinaConversacion {
    estado: EstadoConversacion;
    enviarEvento: (evento: EventoConversacion) => void;
    reiniciar: () => void;
    hayReconocimiento: (quien: Hablante) => boolean;
    hayVoz: (quien: Hablante) => boolean;
    audioSaleDelAparato: (quien: Hablante) => boolean;
}

interface PanelConversacionProps {
    par: Par;
    onCambiarPar: (par: Par) => void;
    estadoDePar: (codigo: string) => EstadoPar;
    maquina: MaquinaConversacion;
    girarMitadB?: boolean;
}

const ETIQUETAS_ESTADO: Record<EstadoVoz, string> = {
    escuchando: "Escuchando…",
    traduciendo: "Traduciendo…",
    hablando: "Hablando…",
    inactivo: "Esperando",
};

const COLORES_ESTADO: Record<EstadoVoz, string> = {
    escuchando: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    traduciendo: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    hablando: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    inactivo: "bg-white/10 text-white/60 border-white/20",
};

function MitadPantalla({
    config,
    girada = false,
    alPulsarMic,
    alEscribirTexto,
    textoInput,
    alCambiarInput,
}: {
    config: MitadConfig;
    girada?: boolean;
    alPulsarMic: () => void;
    alEscribirTexto: (texto: string) => void;
    textoInput: string;
    alCambiarInput: (texto: string) => void;
}) {
    const estiloBase = "flex flex-col h-full w-full p-4 sm:p-6 gap-4";
    const estiloGirada = girada ? "rotate-180" : "";

    const mostrarTexto = config.parcial || config.textoOriginal;
    const mostrarTraducido = config.textoTraducido;

    return (
        <div className={`${estiloBase} ${estiloGirada}`} style={{ transformOrigin: "center" }} data-testid={`mitad-${config.quien.toLowerCase()}`}>
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white/80">{config.nombreIdioma}</span>
                    <span className={COLORES_ESTADO[config.estado]} data-testid={`estado-${config.quien.toLowerCase()}`}>
                        {ETIQUETAS_ESTADO[config.estado]}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={alPulsarMic}
                        disabled={!config.hayReconocimiento || config.estado !== "inactivo"}
                        className={`flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl border transition-colors ${
                            !config.hayReconocimiento || config.estado !== "inactivo"
                                ? "opacity-50 cursor-not-allowed border-white/10 bg-white/5 text-white/30"
                                : "border-white/15 bg-white/5 text-cyan-300 hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"
                        }`}
                        aria-label={config.hayReconocimiento ? "Iniciar reconocimiento de voz" : "Reconocimiento no disponible"}
                        aria-disabled={!config.hayReconocimiento || config.estado !== "inactivo"}
                        data-testid={`mic-${config.quien.toLowerCase()}`}
                    >
                        {config.estado === "escuchando" ? (
                            <Mic className="h-8 w-8 text-emerald-300 animate-pulse" aria-hidden />
                        ) : (
                            <MicOff className="h-8 w-8" aria-hidden />
                        )}
                    </button>
                    {config.audioSaleDelAparato && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-cyan-500/20 text-cyan-300 border-cyan-500/30" aria-label="El audio sale del aparato">
                            <Volume2 className="h-3 w-3" aria-hidden />
                            Sale
                        </span>
                    )}
                    {!config.hayVoz && config.estado !== "inactivo" && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-amber-500/20 text-amber-300 border-amber-500/30" aria-label="No hay voz de salida para este idioma">
                            <VolumeX className="h-3 w-3" aria-hidden />
                            Solo texto
                        </span>
                    )}
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-3 pr-2" data-testid={`turnos-${config.quien.toLowerCase()}`}>
                    {config.parcial && (
                        <div className="rounded-xl bg-white/5 p-3 border border-white/10" data-testid={`parcial-${config.quien.toLowerCase()}`}>
                            <p className="text-sm text-white/60">Escuchando…</p>
                            <p className="mt-1 text-white whitespace-pre-wrap">{config.parcial}</p>
                        </div>
                    )}
                    {config.textoOriginal && !config.parcial && (
                        <div className="rounded-xl bg-white/5 p-3 border border-white/10" data-testid={`original-${config.quien.toLowerCase()}`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-sm font-medium text-white/70">Original</p>
                                {config.msReconocer > 0 && (
                                    <span className="flex items-center gap-1 text-xs text-white/50" data-testid={`ms-reconocer-${config.quien.toLowerCase()}`}>
                                        <Clock className="h-3 w-3" aria-hidden />
                                        {config.msReconocer} ms
                                    </span>
                                )}
                            </div>
                            <p className="text-white whitespace-pre-wrap">{config.textoOriginal}</p>
                        </div>
                    )}
                    {config.textoTraducido && (
                        <div className="rounded-xl bg-cyan-500/10 p-3 border border-cyan-500/20" data-testid={`traducido-${config.quien.toLowerCase()}`}>
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-sm font-medium text-cyan-300">Traducción</p>
                                <div className="flex items-center gap-2">
                                    {config.msTraducir > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-cyan-300/80" data-testid={`ms-traducir-${config.quien.toLowerCase()}`}>
                                            <Clock className="h-3 w-3" aria-hidden />
                                            {config.msTraducir} ms
                                        </span>
                                    )}
                                    {config.msHablar > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-cyan-300/80" data-testid={`ms-hablar-${config.quien.toLowerCase()}`}>
                                            <Clock className="h-3 w-3" aria-hidden />
                                            {config.msHablar} ms
                                        </span>
                                    )}
                                </div>
                            </div>
                            <p className="text-cyan-100 whitespace-pre-wrap">{config.textoTraducido}</p>
                        </div>
                    )}
                    {!config.parcial && !config.textoOriginal && !config.textoTraducido && (
                        <div className="flex items-center justify-center h-full text-white/40 text-sm" data-testid={`vacio-${config.quien.toLowerCase()}`}>
                            Sin turnos aún
                        </div>
                    )}
                </div>

                {(!config.hayReconocimiento || !config.hayVoz) && config.estado === "inactivo" && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3" data-testid={`aviso-input-${config.quien.toLowerCase()}`}>
                        <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="h-4 w-4 text-amber-300" aria-hidden />
                            <p className="text-sm text-amber-200">
                                {!config.hayReconocimiento && !config.hayVoz
                                    ? "No hay reconocimiento ni voz para este idioma. Escribe tu mensaje:"
                                    : !config.hayReconocimiento
                                    ? "No hay reconocimiento de voz. Escribe tu mensaje:"
                                    : "No hay voz de salida. Escribe tu mensaje:"}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={textoInput}
                                onChange={(e) => alCambiarInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && textoInput.trim() && alEscribirTexto(textoInput.trim())}
                                placeholder="Escribe tu mensaje…"
                                className="flex-1 min-h-[44px] rounded-lg border border-white/15 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-cyan-300"
                                aria-label="Escribe tu mensaje"
                                data-testid={`input-${config.quien.toLowerCase()}`}
                            />
                            <button
                                type="button"
                                onClick={() => textoInput.trim() && alEscribirTexto(textoInput.trim())}
                                disabled={!textoInput.trim()}
                                className="cursor-pointer min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-trinity-azure/30 bg-trinity-azure/10 px-4 text-trinity-azure transition-colors hover:bg-trinity-azure/20 disabled:opacity-50 disabled:cursor-not-allowed"
                                aria-label="Enviar mensaje escrito"
                                data-testid={`enviar-${config.quien.toLowerCase()}`}
                            >
                                <Send className="h-5 w-5" aria-hidden />
                            </button>
                        </div>
                    </div>
                )}

                {config.estado === "inactivo" && config.hayReconocimiento && config.hayVoz && (
                    <button
                        type="button"
                        onClick={alPulsarMic}
                        className="w-full cursor-pointer min-h-[56px] rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-300 font-medium transition-colors hover:bg-emerald-500/20 focus-visible:ring-2 focus-visible:ring-emerald-500"
                        data-testid={`btn-hablar-${config.quien.toLowerCase()}`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <Mic className="h-6 w-6" aria-hidden />
                            <span>Mantén para hablar</span>
                        </div>
                    </button>
                )}
            </div>

            {config.error && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200 text-sm flex items-center gap-2" data-testid={`error-${config.quien.toLowerCase()}`}>
                    <AlertCircle className="h-4 w-4" aria-hidden />
                    {config.error}
                </div>
            )}
        </div>
    );
}

function AvisoNoSimultaneo() {
    return (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-full max-w-4xl px-4 sm:px-6" data-testid="aviso-no-simultaneo">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-amber-200 text-sm backdrop-blur-sm">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
                <span>La traducción en tiempo real no es simultánea: hay latencia entre escuchar, traducir y hablar.</span>
                <CheckCircle className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden />
            </div>
        </div>
    );
}

export function PanelConversacion({ par, onCambiarPar, estadoDePar, maquina, girarMitadB = false }: PanelConversacionProps) {
    const [textoInputA, setTextoInputA] = useState("");
    const [textoInputB, setTextoInputB] = useState("");
    const [ultimoError, setUltimoError] = useState<Record<Hablante, string>>({ A: "", B: "" });
    const [estadoMaquina, setEstadoMaquina] = useState<EstadoConversacion>(maquina.estado);

    useEffect(() => {
        const desuscribir = maquina.suscribir((nuevoEstado) => {
            setEstadoMaquina(nuevoEstado);
        });
        return desuscribir;
    }, [maquina]);

    const procesarEstado = useCallback((estado: EstadoConversacion): [MitadConfig, MitadConfig] => {
        const baseConfig = (quien: Hablante): Omit<MitadConfig, "quien" | "idioma" | "nombreIdioma"> => ({
            estado: "inactivo",
            textoOriginal: "",
            textoTraducido: "",
            parcial: "",
            msReconocer: 0,
            msTraducir: 0,
            msHablar: 0,
            audioSaleDelAparato: maquina.audioSaleDelAparato(quien),
            hayVoz: maquina.hayVoz(quien),
            hayReconocimiento: maquina.hayReconocimiento(quien),
        });

        const configA = { quien: "A" as Hablante, idioma: par.origen === "detectar" ? "es" : par.origen, nombreIdioma: porCodigo(par.origen === "detectar" ? "es" : par.origen)?.nombre ?? (par.origen === "detectar" ? "Detectar" : par.origen), ...baseConfig("A") };
        const configB = { quien: "B" as Hablante, idioma: par.destino, nombreIdioma: porCodigo(par.destino)?.nombre ?? par.destino, ...baseConfig("B") };

        const [cfgA, cfgB] = [configA, configB].map((c) => {
            const disp = estado?.fase === "escuchando" && estado.quien === c.quien;
            const trad = estado?.fase === "traduciendo" && estado.quien === c.quien;
            const habl = estado?.fase === "hablando" && estado.quien === c.quien;

            if (disp) {
                return { ...c, estado: "escuchando" as EstadoVoz, parcial: estado.parcial };
            }
            if (trad) {
                return { ...c, estado: "traduciendo" as EstadoVoz, textoOriginal: estado.textoOriginal };
            }
            if (habl) {
                return {
                    ...c,
                    estado: "hablando" as EstadoVoz,
                    textoOriginal: estado.texto,
                    textoTraducido: estado.traduccion,
                    msReconocer: estado.inicioTraduccionMs - estado.inicioMs,
                    msTraducir: estado.inicioHablaMs - estado.inicioTraduccionMs,
                    msHablar: Date.now() - estado.inicioHablaMs,
                };
            }
            return c;
        });

        return [cfgA, cfgB];
    }, [par, maquina]);

    const [configA, configB] = procesarEstado(estadoMaquina);

    const handlePulsarMicA = useCallback(() => {
        if (configA.hayReconocimiento && configA.estado === "inactivo") {
            maquina.enviarEvento({ tipo: "pulsarHablar", quien: "A" });
        }
    }, [configA.hayReconocimiento, configA.estado, maquina]);

    const handlePulsarMicB = useCallback(() => {
        if (configB.hayReconocimiento && configB.estado === "inactivo") {
            maquina.enviarEvento({ tipo: "pulsarHablar", quien: "B" });
        }
    }, [configB.hayReconocimiento, configB.estado, maquina]);

    const handleEscribirA = useCallback((texto: string) => {
        maquina.enviarEvento({ tipo: "resultadoFinal", texto });
        setTextoInputA("");
    }, [maquina]);

    const handleEscribirB = useCallback((texto: string) => {
        maquina.enviarEvento({ tipo: "resultadoFinal", texto });
        setTextoInputB("");
    }, [maquina]);

    return (
        <div className="flex h-screen w-full flex-col bg-black/95 text-white" data-testid="panel-conversacion">
            <div className="flex h-full w-full flex-1 overflow-hidden">
                <MitadPantalla
                    config={configA}
                    alPulsarMic={handlePulsarMicA}
                    alEscribirTexto={handleEscribirA}
                    textoInput={textoInputA}
                    alCambiarInput={setTextoInputA}
                />
                <MitadPantalla
                    config={configB}
                    girada={girarMitadB}
                    alPulsarMic={handlePulsarMicB}
                    alEscribirTexto={handleEscribirB}
                    textoInput={textoInputB}
                    alCambiarInput={setTextoInputB}
                />
            </div>
            <AvisoNoSimultaneo />
        </div>
    );
}

export function crearMaquinaFalsa(overrides: Partial<{
    estado: EstadoConversacion;
    enviarEvento: (evento: EventoConversacion) => void;
    reiniciar: () => void;
    hayReconocimiento: (quien: Hablante) => boolean;
    hayVoz: (quien: Hablante) => boolean;
    audioSaleDelAparato: (quien: Hablante) => boolean;
}> = {}) {
    let estadoActual: EstadoConversacion = { fase: "inactivo" };
    const listeners: ((estado: EstadoConversacion) => void)[] = [];

    const hayReconocimientoFn = overrides.hayReconocimiento ?? (() => true);
    const hayVozFn = overrides.hayVoz ?? (() => true);
    const audioSaleDelAparatoFn = overrides.audioSaleDelAparato ?? (() => true);

    return {
        get estado() {
            return estadoActual;
        },
        set estado(nuevo: EstadoConversacion) {
            estadoActual = nuevo;
            listeners.forEach((l) => l(nuevo));
        },
        enviarEvento: overrides.enviarEvento ?? ((_evento: EventoConversacion) => {}),
        reiniciar: overrides.reiniciar ?? (() => { estadoActual = { fase: "inactivo" }; listeners.forEach((l) => l(estadoActual)); }),
        hayReconocimiento: hayReconocimientoFn,
        hayVoz: hayVozFn,
        audioSaleDelAparato: audioSaleDelAparatoFn,
        suscribir: (fn: (estado: EstadoConversacion) => void) => {
            listeners.push(fn);
            return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
        },
    };
}