"use client";

/** TU18b (TRA1116-APP-F1) · Panel de conversación a dos mitades; presentacional (máquina TU15 por props). */
import { useState, type FormEvent } from "react";
import { AlertTriangle, Languages, Mic, Square, VolumeX } from "lucide-react";
import { porCodigo } from "@/lib/idiomas/idiomas";
import type { EstadoConversacion, Hablante, TurnoCompleto } from "@/lib/traductor/conversacion";

export interface PanelConversacionProps {
    estado: EstadoConversacion;
    turnos: TurnoCompleto[];
    idiomaA: string;
    idiomaB: string;
    /** Cierto si el micrófono o la voz mandan audio fuera del aparato. */
    audioSaleDelAparato: boolean;
    disponibilidad: Record<Hablante, { reconocimiento: { ok: boolean; motivo?: string }; voz: { ok: boolean; motivo?: string } }>;
    /** Gira la mitad de B para dos personas frente a frente. */
    girarB?: boolean;
    onPulsarHablar: (quien: Hablante) => void;
    onDetener?: (quien: Hablante) => void;
    onEscribir: (quien: Hablante, texto: string) => void;
}

const nombreIdioma = (c: string) => porCodigo(c)?.nombre ?? c.toUpperCase();

/** Milisegundos medidos por la máquina; si no son válidos, no se inventan. */
export function formatearMs(ms: number | null | undefined): string {
    return typeof ms === "number" && Number.isFinite(ms) && ms >= 0 ? `${Math.round(ms)} ms` : "—";
}
type Activo = { original: string; traduccion: string; reconocerMs: number | null; traducirMs: number | null };

function faseYContenido(estado: EstadoConversacion, quien: Hablante): { fase: string | null; activo: Activo } {
    const vacio: Activo = { original: "", traduccion: "", reconocerMs: null, traducirMs: null };
    if (estado.fase === "inactivo") return { fase: null, activo: vacio };
    const suyo = estado.quien === quien;
    if (estado.fase === "escuchando") return { fase: suyo ? "Escuchando" : null, activo: suyo ? { ...vacio, original: estado.parcial } : vacio };
    if (estado.fase === "traduciendo") return { fase: suyo ? "Traduciendo…" : null, activo: suyo ? { ...vacio, original: estado.textoOriginal } : vacio };
    if (estado.fase === "hablando") return { fase: suyo ? "Hablando" : null, activo: suyo ? { original: estado.texto, traduccion: estado.traduccion, reconocerMs: estado.inicioTraduccionMs - estado.inicioMs, traducirMs: estado.inicioHablaMs - estado.inicioTraduccionMs } : vacio };
    const enCola = estado.cola.some((turno) => turno.quien === quien);
    return { fase: enCola ? "Turno en espera" : suyo ? "En espera" : null, activo: vacio };
}

interface PropsMitad {
    quien: Hablante; idioma: string; estado: EstadoConversacion; turnos: TurnoCompleto[];
    disp: PanelConversacionProps["disponibilidad"][Hablante]; girar: boolean;
    onPulsarHablar: (q: Hablante) => void; onDetener?: (q: Hablante) => void;
    onEscribir: (q: Hablante, t: string) => void;
}

function Mitad({ quien, idioma, estado, turnos, disp, girar, onPulsarHablar, onDetener, onEscribir }: PropsMitad) {
    const [texto, setTexto] = useState("");
    const { fase, activo } = faseYContenido(estado, quien);
    const escuchando = estado.fase === "escuchando" && estado.quien === quien;
    const propios = turnos.filter((t) => t.quien === quien).slice(-3);
    const sinReconocer = !disp.reconocimiento.ok;
    const sinVoz = !disp.voz.ok;
    const alPulsar = () => (escuchando && onDetener ? onDetener(quien) : onPulsarHablar(quien));
    const alEnviar = (e: FormEvent) => { e.preventDefault(); const t = texto.trim(); if (t) { onEscribir(quien, t); setTexto(""); } };
    return (
        <section data-testid={`mitad-${quien}`} aria-label={`Persona ${quien}: ${nombreIdioma(idioma)}`} className={`flex min-w-0 flex-col gap-5 rounded-3xl border border-white/15 bg-white/5 p-5 ${girar ? "rotate-180" : ""}`}>
            <header className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5">
                    <p className="text-xs uppercase tracking-wide text-white/50">Persona {quien}</p>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-white"><Languages className="h-5 w-5 text-cyan-300" aria-hidden />{nombreIdioma(idioma)}</h2>
                </div>
                <p data-testid={`estado-${quien}`} role="status" aria-live="polite" className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80">{fase ?? "En espera"}</p>
            </header>
            <button type="button" data-testid={`microfono-${quien}`} onClick={alPulsar} disabled={sinReconocer} aria-pressed={escuchando} aria-label={escuchando ? `Detener el micrófono de la persona ${quien}` : `Hablar por la persona ${quien}`} className="mx-auto flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-full bg-cyan-500 text-xs font-semibold text-white transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40">
                {escuchando ? <Square className="h-7 w-7" aria-hidden /> : <Mic className="h-7 w-7" aria-hidden />}
                <span>{escuchando ? "Detener" : "Hablar"}</span>
            </button>
            {sinReconocer && <p data-testid={`sin-reconocimiento-${quien}`} className="text-sm text-amber-300">{disp.reconocimiento.motivo ?? "Sin reconocimiento de voz en este aparato."}</p>}
            {sinVoz && <p data-testid={`sin-voz-${quien}`} className="flex items-center gap-2 text-sm text-amber-300"><VolumeX className="h-4 w-4" aria-hidden />{disp.voz.motivo ?? "Sin voz para este idioma en este aparato."}</p>}
            <ol aria-label={`Turnos de la persona ${quien}`} className="flex flex-col gap-3">
                {propios.map((t, i) => (
                    <li key={`${t.quien}-${i}-${t.texto}`} data-testid={`turno-${quien}-${i}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm">
                        <p className="text-white/80">{t.texto}</p>
                        <p className="font-medium text-cyan-200">{t.traduccion}</p>
                        <p className="text-xs text-white/60">Escuchar {formatearMs(t.msReconocer)} · Traducir {formatearMs(t.msTraducir)} · Hablar {formatearMs(t.msHablar)}</p>
                    </li>
                ))}
                {activo.original && (
                    <li data-testid={`turno-en-curso-${quien}`} className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 p-3 text-sm">
                        <p className="text-white/80">{activo.original}</p>
                        <p className="font-medium text-cyan-200">{activo.traduccion || "…"}</p>
                        {activo.reconocerMs !== null && <p className="text-xs text-white/60">Escuchar {formatearMs(activo.reconocerMs)} · Traducir {formatearMs(activo.traducirMs)}</p>}
                    </li>
                )}
                {propios.length === 0 && !activo.original && <li className="text-sm text-white/50">Todavía no hay turnos.</li>}
            </ol>
            {(sinReconocer || sinVoz) && (
                <form onSubmit={alEnviar} data-testid={`escribir-${quien}`} className="flex flex-col gap-2">
                    <label htmlFor={`escribir-texto-${quien}`} className="text-xs text-white/70">Escribe lo que quieres decir</label>
                    <div className="flex gap-2">
                        <input id={`escribir-texto-${quien}`} data-testid={`entrada-${quien}`} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Texto del turno" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus-visible:ring-2 focus-visible:ring-cyan-300" />
                        <button type="submit" className="min-h-[44px] cursor-pointer rounded-xl bg-white/10 px-4 text-sm text-white transition-colors hover:bg-white/20">Usar texto</button>
                    </div>
                </form>
            )}
        </section>
    );
}

export function PanelConversacion(props: PanelConversacionProps) {
    const { estado, turnos, idiomaA, idiomaB, audioSaleDelAparato, disponibilidad, girarB = false, onPulsarHablar, onDetener, onEscribir } = props;
    const mitad = (quien: Hablante, idioma: string, girar: boolean) => (
        <Mitad quien={quien} idioma={idioma} estado={estado} turnos={turnos} disp={disponibilidad[quien]} girar={girar} onPulsarHablar={onPulsarHablar} onDetener={onDetener} onEscribir={onEscribir} />
    );
    return (
        <section data-testid="panel-conversacion" aria-label="Conversación por voz" className="flex flex-col gap-5">
            <div role="note" data-testid="aviso-conversacion" className="flex gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
                <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
                <div className="flex flex-col gap-1">
                    <p>La traducción en tiempo real no es simultánea: primero se escucha, después se traduce y solo entonces se habla.</p>
                    <p data-testid="aviso-audio">{audioSaleDelAparato ? "El audio de tu voz sale de este aparato." : "El audio de tu voz se procesa en este aparato."}</p>
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {mitad("A", idiomaA, false)}
                {mitad("B", idiomaB, girarB)}
            </div>
        </section>
    );
}
