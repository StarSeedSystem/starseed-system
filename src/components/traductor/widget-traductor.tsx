"use client";

import { Languages, Copy, Repeat, Volume2 } from "lucide-react";
import { AvisoPrivacidad } from "./aviso-privacidad";
import { AVISOS, type IdMotor } from "@/lib/traductor/privacidad";
import type { ParIdiomas } from "@/lib/traductor/tipos";
import type { ResultadoTraductor } from "@/lib/traductor/servicio";

const TOPE_CARACTERES = 5000;
const MENSAJE_SIN_VOZ = "La voz no está disponible en este aparato.";

export interface WidgetTraductorAjustes {
    idiomasFijados: [string, string];
    motorPreferido: "automatico" | "local";
    tamanoLetra: "S" | "M" | "L";
    historialCorto: boolean;
}

interface WidgetTraductorProps {
    ajustes: WidgetTraductorAjustes;
    onAjustes: (patch: Partial<WidgetTraductorAjustes>) => void;
    origen: string;
    onEscribir: (texto: string) => void;
    resultado: string;
    motorInfo: { motor: IdMotor; local: boolean } | null;
    avisoPendiente: IdMotor | null;
    onTraducir: () => void;
    onReintentar: () => void;
    onIntercambiar: () => void;
    onCopiar: () => void;
    onLeer: () => void;
    onAceptarAviso: (motor: IdMotor) => void;
    onCambiarMotor: () => void;
    cargando: boolean;
    error: Error | null;
    vozDisponible: boolean;
    motivoVoz: string | null;
    copiado: boolean;
}

export function WidgetTraductor({
    ajustes,
    onAjustes,
    origen,
    onEscribir,
    resultado,
    motorInfo,
    avisoPendiente,
    onTraducir,
    onReintentar,
    onIntercambiar,
    onCopiar,
    onLeer,
    onAceptarAviso,
    onCambiarMotor,
    cargando,
    error,
    vozDisponible,
    motivoVoz,
    copiado,
}: WidgetTraductorProps) {
    const par: ParIdiomas = {
        origen: ajustes.idiomasFijados[0],
        destino: ajustes.idiomasFijados[1],
    };

    return (
        <section aria-label="Traducción de texto" className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
                <label htmlFor="caja-origen" className="text-sm font-medium text-white/80">
                    Texto original
                </label>
                <textarea
                    id="caja-origen"
                    data-testid="caja-origen"
                    value={origen}
                    onChange={(e) => onEscribir(e.target.value)}
                    maxLength={TOPE_CARACTERES}
                    rows={5}
                    placeholder="Escribe o pega el texto a traducir"
                    className="w-full rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-cyan-300"
                />
                <div className="flex items-center justify-between gap-3 text-xs text-white/60">
                    <span data-testid="contador-caracteres">{origen.length} / {TOPE_CARACTERES}</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            data-testid="boton-intercambiar"
                            onClick={onIntercambiar}
                            aria-label="Intercambiar idiomas"
                            className="cursor-pointer p-1 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <Repeat className="h-4 w-4" aria-hidden />
                        </button>
                        <span>{ajustes.idiomasFijados[0]} → {ajustes.idiomasFijados[1]}</span>
                    </div>
                </div>
            </div>
            <button
                type="button"
                data-testid="boton-traducir"
                onClick={onTraducir}
                disabled={cargando || !origen.trim()}
                className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-trinity-azure px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
                {cargando && <Languages className="h-4 w-4 animate-spin" aria-hidden />}
                {cargando ? "Traduciendo..." : "Traducir"}
            </button>
            {error && (
                <p role="alert" data-testid="error-traduccion" className="text-sm text-red-300">
                    {error.message}
                </p>
            )}
            <div className="flex flex-col gap-2">
                <label htmlFor="caja-resultado" className="text-sm font-medium text-white/80">
                    Traducción
                </label>
                <div className="relative">
                    <textarea
                        id="caja-resultado"
                        data-testid="caja-resultado"
                        value={resultado}
                        readOnly
                        rows={5}
                        placeholder="La traducción aparecerá aquí"
                        className="w-full rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white outline-none placeholder:text-white/50 pr-12"
                    />
                    {resultado && (
                        <button
                            type="button"
                            data-testid="boton-copiar"
                            onClick={onCopiar}
                            className="absolute top-2 right-2 cursor-pointer p-1 rounded-lg hover:bg-white/10 transition-colors"
                            aria-label={copiado ? "Copiado" : "Copiar"}
                        >
                            <Copy className="h-4 w-4" aria-hidden />
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        data-testid="boton-leer"
                        onClick={onLeer}
                        disabled={!resultado.trim() || !vozDisponible}
                        className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Volume2 className="h-4 w-4" aria-hidden />
                        Leer en voz alta
                    </button>
                </div>
                {motivoVoz && <p data-testid="motivo-voz" className="text-sm text-amber-300">{motivoVoz}</p>}
                {motorInfo && (
                    <p data-testid="motor-info" className="text-xs text-white/60">
                        Motor: {motorInfo.motor} · {motorInfo.local ? "en tu aparato" : `sale a ${AVISOS[motorInfo.motor].sale}`}
                    </p>
                )}
            </div>
            {avisoPendiente && (
                <AvisoPrivacidad
                    motor={avisoPendiente}
                    onAceptar={() => onAceptarAviso(avisoPendiente)}
                    onCambiarMotor={onCambiarMotor}
                />
            )}
        </section>
    );
}

export default WidgetTraductor;