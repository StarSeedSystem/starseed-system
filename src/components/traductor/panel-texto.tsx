"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Volume2, VolumeX, AlertTriangle, Loader2, Mic2, Globe, ArrowUpRight } from "lucide-react";
import { IDIOMAS, porCodigo } from "@/lib/idiomas/idiomas";
import type { ResultadoTraductor, ParIdiomas } from "@/lib/traductor/tipos";
import type { ResultadoServicioTraductor } from "@/lib/traductor/servicio";
import { resetearEstado as resetearEstadoVoz, vocesDe, hablar } from "@/lib/traductor/voz-habla";

const LIMITE_CARACTERES = 5000;
const PAUSA_ESCRIBIR_MS = 600;

export interface TraductorServicio {
    traducir: (texto: string, par: ParIdiomas) => Promise<ResultadoServicioTraductor>;
}

export interface PanelTextoProps {
    servicio: TraductorServicio;
    timbre: {
        genero: "femenina" | "masculina" | "neutra";
    };
    parIdiomas: ParIdiomas;
    onCambiarPar?: (par: ParIdiomas) => void;
    traducirAlEscribir?: boolean;
    necesitaAvisoDialog?: (motor: string) => void;
}

function formatearTiempo(ms: number): string {
    if (ms < 1000) return `${ms} ms`;
    return `${(ms / 1000).toFixed(1)} s`;
}

function obtenerIdiomaDeTexto(texto: string): string {
    return porCodigo(texto)?.codigo ?? "es";
}

function leerParamsURL(): { texto?: string; de?: string; a?: string } {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    return {
        texto: params.get("texto") ?? undefined,
        de: params.get("de") ?? undefined,
        a: params.get("a") ?? undefined,
    };
}

function InsigniaMotor({
    motor,
    local,
    necesitaAviso,
    onAbrirAviso,
}: {
    motor: string;
    local: boolean;
    necesitaAviso?: boolean;
    onAbrirAviso?: () => void;
}) {
    return (
        <div className="flex items-center gap-2 text-[11px] text-white/70">
            <span className="font-mono tabular-nums text-cyan-300">Motor:</span>
            <span className="font-medium text-white capitalize">{motor}</span>
            <span className="text-white/40">·</span>
            <span className={local ? "text-emerald-300" : "text-amber-300"}>
                {local ? "en tu aparato" : "sale a internet"}
            </span>
            {necesitaAviso && onAbrirAviso && (
                <button
                    type="button"
                    onClick={onAbrirAviso}
                    className="flex min-h-[28px] min-w-[28px] cursor-pointer items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 transition-colors hover:bg-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-400"
                    aria-label={`Abrir aviso para ${motor}`}
                    data-testid="boton-necesita-aviso"
                >
                    <AlertTriangle className="h-4 w-4" aria-hidden />
                </button>
            )}
        </div>
    );
}

function CajaOrigen({
    valor,
    onCambio,
    deshabilitado,
}: {
    valor: string;
    onCambio: (texto: string) => void;
    deshabilitado?: boolean;
}) {
    const contador = valor.length;
    const excedido = contador > LIMITE_CARACTERES;

    return (
        <div className="flex flex-col gap-2">
            <label htmlFor="texto-origen" className="text-[11px] text-white/60">
                Texto de origen
            </label>
            <textarea
                id="texto-origen"
                value={valor}
                onChange={(e) => onCambio(e.target.value)}
                disabled={deshabilitado}
                maxLength={LIMITE_CARACTERES}
                rows={6}
                placeholder="Escribe o pega el texto a traducir…"
                className={`
                    w-full min-h-[120px] max-h-[200px] resize-y
                    rounded-xl border bg-white/5 px-3 py-2.5 text-sm text-white
                    placeholder:text-white/40 outline-none transition-colors
                    ${deshabilitado ? "opacity-50 cursor-not-allowed" : "border-white/10 focus-visible:ring-2 focus-visible:ring-cyan-300"}
                    ${excedido ? "border-red-500/50" : "border-white/10"}
                `}
                aria-label="Texto de origen para traducir"
                data-testid="caja-origen"
            />
            <div className="flex items-center justify-between">
                <span className={`
                    text-[11px] font-mono tabular-nums
                    ${excedido ? "text-red-400" : contador > LIMITE_CARACTERES * 0.8 ? "text-amber-300" : "text-white/60"}
                `}>
                    {contador} / {LIMITE_CARACTERES}
                </span>
                {excedido && (
                    <span className="text-[11px] text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                        Límite superado
                    </span>
                )}
            </div>
        </div>
    );
}

function CajaResultado({
    valor,
    copiado,
    onCopiar,
    onLeerVoz,
    hayVoz,
    motivoSinVoz,
    cargando,
}: {
    valor: string;
    copiado: boolean;
    onCopiar: () => void;
    onLeerVoz: () => void;
    hayVoz: boolean;
    motivoSinVoz?: string;
    cargando?: boolean;
}) {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
                <label htmlFor="texto-resultado" className="text-[11px] text-white/60">
                    Traducción
                </label>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onCopiar}
                        disabled={!valor || copiado || cargando}
                        className={`
                            flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center
                            rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300
                            ${!valor || cargando
                                ? "opacity-50 cursor-not-allowed bg-white/5 text-white/30"
                                : copiado
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-white/5 text-white/70 hover:bg-white/10"
                            }
                        `}
                        aria-label={copiado ? "Copiado" : "Copiar traducción"}
                        data-testid="boton-copiar"
                    >
                        {copiado ? (
            <CheckCircle className="h-5 w-5" aria-hidden />
        ) : (
            <Copy className="h-5 w-5" aria-hidden />
        )}
                    </button>
                    <button
                        type="button"
                        onClick={onLeerVoz}
                        disabled={!valor || !hayVoz || cargando}
                        className={`
                            flex min-h-[40px] min-w-[40px] cursor-pointer items-center justify-center
                            rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300
                            ${!valor || !hayVoz || cargando
                                ? "opacity-50 cursor-not-allowed bg-white/5 text-white/30"
                                : "bg-white/5 text-white/70 hover:bg-white/10"
                            }
                        `}
                        aria-label={hayVoz ? "Leer en voz alta" : `No hay voz disponible: ${motivoSinVoz}`}
                        data-testid="boton-leer-voz"
                    >
                        {hayVoz ? <Volume2 className="h-5 w-5" aria-hidden /> : <VolumeX className="h-5 w-5" aria-hidden />}
                    </button>
                </div>
            </div>
            <div className="min-h-[120px] max-h-[200px] overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white">
                {valor ? (
                    <p className="whitespace-pre-wrap break-words">{valor}</p>
                ) : (
                    <p className="text-white/40 text-center py-8">La traducción aparecerá aquí…</p>
                )}
                {!hayVoz && motivoSinVoz && (
                    <p className="mt-2 text-[11px] text-amber-300 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {motivoSinVoz}
                    </p>
                )}
            </div>
        </div>
    );
}

function BotonTraducir({
    onClick,
    deshabilitado,
    cargando,
    traducirAlEscribir,
}: {
    onClick: () => void;
    deshabilitado: boolean;
    cargando: boolean;
    traducirAlEscribir: boolean;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={deshabilitado || cargando}
            className={`
                flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2
                rounded-xl font-medium transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300
                ${cargando
                    ? "bg-cyan-500/20 text-cyan-300 cursor-wait"
                    : deshabilitado
                    ? "opacity-50 cursor-not-allowed bg-white/5 text-white/30"
                    : "bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
                }
            `}
            aria-label={cargando ? "Traduciendo…" : traducirAlEscribir ? "Traducir (modo al escribir)" : "Traducir"}
            data-testid="boton-traducir"
        >
            {cargando ? (
                <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                    <span>Traduciendo…</span>
                </>
            ) : (
                <>
                    <Globe className="h-5 w-5" aria-hidden />
                    <span>Traducir</span>
                </>
            )}
        </button>
    );
}

function CheckCircle({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
    );
}

export function PanelTexto({
    servicio,
    timbre,
    parIdiomas,
    onCambiarPar,
    traducirAlEscribir = false,
    necesitaAvisoDialog,
}: PanelTextoProps) {
    const [textoOrigen, setTextoOrigen] = useState("");
    const [textoResultado, setTextoResultado] = useState("");
    const [motorActual, setMotorActual] = useState<string>("");
    const [localActual, setLocalActual] = useState<boolean>(true);
    const [cargando, setCargando] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | undefined>();
    const [necesitaAviso, setNecesitaAviso] = useState<string | null>(null);
    const [hayVoz, setHayVoz] = useState(true);
    const [motivoSinVoz, setMotivoSinVoz] = useState<string>("");

    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const ultimaTraduccionRef = useRef<number>(0);

    const comprobarVoz = useCallback((idioma: string) => {
        const voces = vocesDe(idioma);
        const tieneVoz = voces.length > 0;
        setHayVoz(tieneVoz);
        if (!tieneVoz) {
            setMotivoSinVoz(`No hay una voz de ${idioma} en este aparato`);
        }
        return tieneVoz;
    }, []);

    const leerEnVozAlta = useCallback(async () => {
        if (!textoResultado || !hayVoz) return;

        const idiomaDestino = porCodigo(parIdiomas.destino)?.codigo ?? "es";
        const resultado = hablar(textoResultado, idiomaDestino, "navegador");
        if (!resultado.ok && resultado.motivo) {
            setHayVoz(false);
            setMotivoSinVoz(resultado.motivo);
        }
    }, [textoResultado, hayVoz, parIdiomas.destino]);

    const copiarAlPortapapeles = useCallback(async () => {
        if (!textoResultado) return;
        try {
            await navigator.clipboard.writeText(textoResultado);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        } catch {
            setError("No se pudo copiar al portapapeles");
            setTimeout(() => setError(null), 3000);
        }
    }, [textoResultado]);

    const ejecutarTraduccion = useCallback(async () => {
        if (!textoOrigen.trim()) {
            setTextoResultado("");
            setMotorActual("");
            setAviso(undefined);
            setError(null);
            setNecesitaAviso(null);
            return;
        }

        setCargando(true);
        setError(null);
        setNecesitaAviso(null);

        try {
            const resultado = await servicio.traducir(textoOrigen, parIdiomas);

            if ("necesitaAviso" in resultado) {
                setNecesitaAviso(resultado.necesitaAviso);
                setTextoResultado("");
                setMotorActual("");
                setAviso(undefined);
            } else if ("error" in resultado) {
                setError(resultado.error);
                setTextoResultado("");
                setMotorActual("");
                setAviso(undefined);
            } else {
                setTextoResultado(resultado.texto);
                setMotorActual(resultado.motor);
                setLocalActual(resultado.local);
                setAviso(resultado.aviso);
                setNecesitaAviso(null);
                comprobarVoz(porCodigo(parIdiomas.destino)?.codigo ?? "es");
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error desconocido al traducir");
        } finally {
            setCargando(false);
        }
    }, [servicio, textoOrigen, parIdiomas, comprobarVoz]);

    const manejarCambioOrigen = useCallback(
        (nuevoTexto: string) => {
            setTextoOrigen(nuevoTexto);
            setCopiado(false);

            if (traducirAlEscribir && nuevoTexto.trim()) {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                const ahora = Date.now();
                const tiempoDesdeUltima = ahora - ultimaTraduccionRef.current;
                const espera = Math.max(0, PAUSA_ESCRIBIR_MS - tiempoDesdeUltima);

                timeoutRef.current = setTimeout(() => {
                    ultimaTraduccionRef.current = Date.now();
                    ejecutarTraduccion();
                }, espera);
            } else {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
            }
        },
        [traducirAlEscribir, ejecutarTraduccion]
    );

    const manejarClickTraducir = useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        ejecutarTraduccion();
    }, [ejecutarTraduccion]);

    const manejarAbrirAviso = useCallback(() => {
        if (necesitaAviso && necesitaAvisoDialog) {
            necesitaAvisoDialog(necesitaAviso);
        }
    }, [necesitaAviso, necesitaAvisoDialog]);

    useEffect(() => {
        const params = leerParamsURL();
        let textoInicial = params.texto ?? "";

        if (params.de && params.a) {
            setTextoOrigen(textoInicial);
            if (onCambiarPar) {
                onCambiarPar({ origen: params.de, destino: params.a });
            }
        } else if (textoInicial) {
            setTextoOrigen(textoInicial);
        }

        if (textoInicial.trim()) {
            ejecutarTraduccion();
        }
    }, []);

    useEffect(() => {
        if (necesitaAviso && necesitaAvisoDialog) {
            necesitaAvisoDialog(necesitaAviso);
        }
    }, [necesitaAviso, necesitaAvisoDialog]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            resetearEstadoVoz();
        };
    }, []);

    const textoOrigenTieneContenido = textoOrigen.trim().length > 0;
    const puedeTraducir = textoOrigenTieneContenido && !cargando;

    return (
        <div className="flex flex-col gap-4 w-full max-w-2xl" data-testid="panel-texto">
            <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
                <CajaOrigen
                    valor={textoOrigen}
                    onCambio={manejarCambioOrigen}
                    deshabilitado={cargando}
                />
                <CajaResultado
                    valor={textoResultado}
                    copiado={copiado}
                    onCopiar={copiarAlPortapapeles}
                    onLeerVoz={leerEnVozAlta}
                    hayVoz={hayVoz}
                    motivoSinVoz={motivoSinVoz}
                    cargando={cargando}
                />
            </div>

            <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-4">
                    <BotonTraducir
                        onClick={manejarClickTraducir}
                        deshabilitado={!puedeTraducir}
                        cargando={cargando}
                        traducirAlEscribir={traducirAlEscribir}
                    />

                    <InsigniaMotor
                        motor={motorActual || "—"}
                        local={localActual}
                        necesitaAviso={!!necesitaAviso}
                        onAbrirAviso={manejarAbrirAviso}
                    />
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-[11px] text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2" data-testid="error-traduccion">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>{error}</span>
                    </div>
                )}

                {aviso && !necesitaAviso && (
                    <div className="flex items-center gap-2 text-[11px] text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-2" data-testid="aviso-traduccion">
                        <Globe className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>{aviso}</span>
                    </div>
                )}

                {necesitaAviso && (
                    <div className="flex items-center gap-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2" data-testid="necesita-aviso">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span>Este motor requiere un aviso antes de usarse.</span>
                        <button
                            type="button"
                            onClick={manejarAbrirAviso}
                            className="ml-auto flex min-h-[28px] min-w-[28px] cursor-pointer items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 transition-colors hover:bg-amber-500/30 focus-visible:ring-2 focus-visible:ring-amber-400"
                            aria-label="Ver aviso"
                            data-testid="boton-ver-aviso"
                        >
                            <ArrowUpRight className="h-4 w-4" aria-hidden />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}