"use client";

/**
 * TU17 (TRA1116-APP-F1) · Panel de texto del Traductor: caja de origen con
 * contador y tope de 5.000, resultado de solo lectura, «Traducir» y «traducir
 * mientras escribo» (pausa 600 ms, apagado), copiar, leer en voz alta (voz
 * inyectada; si no hay, lo dice), «Motor: X · en tu aparato / sale a …» según
 * `local`, diálogo de TU20 ante `necesitaAviso` y URL `?texto=&de=&a=`. Servicio y voz inyectados.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Volume2 } from "lucide-react";
import { AvisoPrivacidad } from "./aviso-privacidad";
import { AVISOS, type IdMotor } from "@/lib/traductor/privacidad";
import type { ParIdiomas } from "@/lib/traductor/tipos";
import type { ResultadoServicioTraductor } from "@/lib/traductor/servicio";

export const TOPE_CARACTERES = 5000;
const MENSAJE_SIN_VOZ = "La voz no está disponible en este aparato.";

export interface PanelTextoProps {
    servicio: { traducir: (texto: string, par: ParIdiomas) => Promise<ResultadoServicioTraductor> };
    voz: { hablar: (texto: string, idioma: string) => { ok: boolean; motivo?: string } } | null;
    par: ParIdiomas;
    onCambiarPar?: (par: ParIdiomas) => void;
    alAceptarAviso?: (motor: IdMotor) => void;
    pausaMs?: number;
}

export function PanelTexto({ servicio, voz, par, onCambiarPar, alAceptarAviso, pausaMs = 600 }: PanelTextoProps) {
    const [origen, setOrigen] = useState("");
    const [resultado, setResultado] = useState("");
    const [motorInfo, setMotorInfo] = useState<{ motor: IdMotor; local: boolean } | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [avisoPendiente, setAvisoPendiente] = useState<IdMotor | null>(null);
    const [motivoVoz, setMotivoVoz] = useState<string | null>(null);
    const [mientrasEscribe, setMientrasEscribe] = useState(false);
    const [copiado, setCopiado] = useState(false);
    const urlAplicada = useRef(false);
    const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

    const traducir = async (texto: string) => {
        if (!texto.trim()) return;
        setCargando(true);
        setError(null);
        setMotivoVoz(null);
        const r = await servicio.traducir(texto, par);
        if ("necesitaAviso" in r) setAvisoPendiente(r.necesitaAviso);
        else if ("error" in r) setError(r.error);
        else {
            setResultado(r.texto);
            setMotorInfo({ motor: r.motor, local: r.local });
        }
        setCargando(false);
    };

    useEffect(() => {
        if (urlAplicada.current) return;
        urlAplicada.current = true;
        if (typeof window === "undefined") return;
        const p = new URLSearchParams(window.location.search);
        const t = p.get("texto");
        const de = p.get("de"), a = p.get("a");
        if (t) setOrigen(t);
        if ((de || a) && onCambiarPar) onCambiarPar({ origen: de ?? par.origen, destino: a ?? par.destino });
    }, [onCambiarPar, par.origen, par.destino]);

    const alEscribir = (texto: string) => {
        setOrigen(texto);
        if (temporizador.current) clearTimeout(temporizador.current);
        if (mientrasEscribe && texto.trim()) temporizador.current = setTimeout(() => void traducir(texto), pausaMs);
    };

    const leer = () => {
        if (!resultado.trim()) return;
        if (!voz) { setMotivoVoz(MENSAJE_SIN_VOZ); return; }
        const r = voz.hablar(resultado, par.destino);
        setMotivoVoz(r.ok ? null : (r.motivo ?? MENSAJE_SIN_VOZ));
    };

    const copiar = async () => {
        if (!resultado) return;
        try { await navigator.clipboard.writeText(resultado); setCopiado(true); } catch { setCopiado(false); }
    };

    return (
        <section aria-label="Traducción de texto" className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
                <label htmlFor="caja-origen" className="text-sm font-medium text-white/80">Texto original</label>
                <textarea id="caja-origen" data-testid="caja-origen" value={origen} onChange={(e) => alEscribir(e.target.value)} maxLength={TOPE_CARACTERES} rows={6} placeholder="Escribe o pega el texto a traducir" className="w-full rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-cyan-300" />
                <div className="flex items-center justify-between gap-3 text-xs text-white/60">
                    <span data-testid="contador-caracteres">{origen.length} / {TOPE_CARACTERES}</span>
                    <label className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" data-testid="interruptor-mientras-escribe" checked={mientrasEscribe} onChange={(e) => setMientrasEscribe(e.target.checked)} className="cursor-pointer accent-cyan-400" />
                        Traducir mientras escribo
                    </label>
                </div>
            </div>
            <button type="button" data-testid="boton-traducir" onClick={() => void traducir(origen)} disabled={cargando} className="flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl bg-trinity-azure px-4 py-2 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {cargando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Traducir
            </button>
            {error && <p role="alert" data-testid="error-traduccion" className="text-sm text-red-300">{error}</p>}
            <div className="flex flex-col gap-2">
                <label htmlFor="caja-resultado" className="text-sm font-medium text-white/80">Traducción</label>
                <textarea id="caja-resultado" data-testid="caja-resultado" value={resultado} readOnly rows={6} placeholder="La traducción aparecerá aquí" className="w-full rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white outline-none placeholder:text-white/50" />
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" data-testid="boton-copiar" onClick={() => void copiar()} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm text-white/80 transition-colors hover:bg-white/10">
                        {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />} {copiado ? "Copiado" : "Copiar"}
                    </button>
                    <button type="button" data-testid="boton-leer" onClick={leer} className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm text-white/80 transition-colors hover:bg-white/10">
                        <Volume2 className="h-4 w-4" aria-hidden /> Leer en voz alta
                    </button>
                </div>
                {motivoVoz && <p data-testid="motivo-voz" className="text-sm text-amber-300">{motivoVoz}</p>}
                {motorInfo && <p data-testid="motor-info" className="text-xs text-white/60">Motor: {motorInfo.motor} · {motorInfo.local ? "en tu aparato" : `sale a ${AVISOS[motorInfo.motor].sale}`}</p>}
            </div>
            {avisoPendiente && <AvisoPrivacidad motor={avisoPendiente} onAceptar={() => { alAceptarAviso?.(avisoPendiente); setAvisoPendiente(null); void traducir(origen); }} onCambiarMotor={() => setAvisoPendiente(null)} />}
        </section>
    );
}
