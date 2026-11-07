"use client";

/**
 * HiloNeurona — la conversación con UNA neurona (o con las neuronas de una cuenta que comparte un
 * cerebro contigo) en la pestaña «Neuronas» de Mensajes (MSJ1107A · 2026-11-07).
 * Historial local de este aparato (funciona sin internet), cada mensaje con su pastilla de vía,
 * aviso de lo que espera un medio con «Reintentar ahora», y los ajustes de medio de este chat.
 * (NEU1107A) No solo texto: archivos de cualquier formato (varios, arrastrar y soltar, progreso,
 * reanudar, SHA-256, vista previa y descarga), llamadas de voz y vídeo, pantalla compartida y
 * transmisiones en vivo, cada una con su vía y sus confirmaciones.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Clock, Loader2, Maximize2, Minimize2, Paperclip, Radio, RotateCcw, Route, SendHorizontal, Upload } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ACENTO, pildoraFantasma } from "@/components/messages/marco/estilos";
import { PastillaVia, type PendienteVia } from "@/components/messages/medios/pastilla-via";
import { BloqueMedioTransmision } from "@/components/messages/medios/bloque-medio";
import { VersionNeurona } from "@/components/neurons/version-neurona";
import { IconoNeurona } from "@/components/messages/neuronas/icono-neurona";
import { SeparadorDia } from "@/components/messages/dm/separador-dia";
import { formatearHora } from "@/components/messages/dm/utilidades-hilo";
import type { ConversacionNeurona } from "@/lib/mensajeria/neuronas/agrupar";
import type { MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";
import {
    enviarANeurona, fijarHiloAbierto, marcarConversacionLeida, reintentarMensaje, reintentarPendientes, useBandejaMalla,
} from "@/lib/mensajeria/neuronas/buzon";
import { resumenPreferencias } from "@/lib/mensajeria/medios/medios";
import { claveChat, usePreferenciasMedio } from "@/lib/mensajeria/medios/preferencias-store";
import { AVISO_LIMITES_MEDIOS } from "@/lib/mensajeria/neuronas/datos-neurona";
import { enviarArchivosANeurona } from "@/lib/mensajeria/neuronas/archivos-neurona";
import { BotonesLlamadaNeurona, PanelTransmitir, TarjetaArchivo, TarjetaFlujo, TarjetaLlamada } from "@/components/messages/neuronas/datos-hilo";

/** Archivos que se aceptan de una vez (arrastrar o elegir). */
const MAX_ARCHIVOS_A_LA_VEZ = 20;

export interface HiloNeuronaProps {
    conversacion: ConversacionNeurona;
    /** Cerebros a los que sirve (para el subtítulo). */
    cerebros: string[];
    esMovil: boolean;
    onAtras?: () => void;
    enfocado?: boolean;
    onAlternarEnfoque?: () => void;
}

function mismoDia(a: number, b: number): boolean {
    const x = new Date(a);
    const y = new Date(b);
    return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}

function Burbuja({ m, mostrarVia, onReintentar }: { m: MensajeMalla; mostrarVia: boolean; onReintentar: () => void }) {
    const mio = m.dir === "sale";
    const pendiente: PendienteVia | null =
        m.estado === "enviando" || m.estado === "en-espera" || m.estado === "fallido"
            ? { estado: m.estado, aviso: m.aviso, descartados: m.descartados }
            : null;
    const iso = new Date(m.at).toISOString();
    return (
        <div className={cn("flex", mio ? "justify-end" : "justify-start")} id={`neu-${m.id}`} data-testid="burbuja-neurona">
            <div
                className={cn("max-w-[min(520px,82%)] rounded-[18px] px-3.5 py-2", mio ? "rounded-br-[6px]" : "rounded-bl-[6px]")}
                style={
                    mio
                        ? { background: `linear-gradient(135deg, #6a4ae6 0%, ${ACENTO.mensajes} 48%, #9b82ff 100%)`, boxShadow: `0 6px 18px ${ACENTO.mensajes}33` }
                        : { background: "rgba(255,255,255,.065)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }
                }
            >
                {!mio && m.deNombre && <p className="mb-0.5 text-[11.5px] font-semibold text-[#b7a6ff]">{m.deNombre}</p>}
                {m.adjunto && <TarjetaArchivo m={m} />}
                {m.llamada && <TarjetaLlamada m={m} />}
                {m.flujo && <TarjetaFlujo m={m} />}
                {m.texto && <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white">{m.texto}</p>}
                <div className="mt-1 flex flex-wrap items-center justify-end gap-1.5">
                    {(pendiente || (mostrarVia && m.via)) && <PastillaVia via={pendiente ? null : m.via} pendiente={pendiente} mio={mio} />}
                    {m.estado === "fallido" && (
                        <button
                            type="button"
                            onClick={onReintentar}
                            className="ss-redondo inline-flex cursor-pointer items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold leading-[15px] text-white"
                            style={{ background: "rgba(255,255,255,.18)" }}
                        >
                            <RotateCcw className="h-2.5 w-2.5" /> Reintentar
                        </button>
                    )}
                    <time dateTime={iso} className={cn("text-[10.5px]", mio ? "text-white/70" : "text-white/50")}>
                        {formatearHora(iso, true)}
                    </time>
                </div>
            </div>
        </div>
    );
}

export function HiloNeurona({ conversacion, cerebros, esMovil, onAtras, enfocado, onAlternarEnfoque }: HiloNeuronaProps) {
    const bandeja = useBandejaMalla();
    const clavePrefs = claveChat("neurona", conversacion.clave);
    const medios = usePreferenciasMedio(clavePrefs);
    const mensajes = useMemo(() => bandeja.conv[conversacion.clave]?.mensajes ?? [], [bandeja, conversacion.clave]);
    const enEspera = mensajes.filter((m) => m.dir === "sale" && m.estado === "en-espera").length;
    const [texto, setTexto] = useState("");
    const [enviando, setEnviando] = useState(false);
    const [reintentando, setReintentando] = useState(false);
    const [ajustes, setAjustes] = useState(false);
    const [transmitir, setTransmitir] = useState(false);
    const [arrastrando, setArrastrando] = useState(false);
    const [mandandoArchivos, setMandandoArchivos] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const areaRef = useRef<HTMLTextAreaElement>(null);
    const archivoRef = useRef<HTMLInputElement>(null);

    // Sus avisos no salen como notificación mientras este chat está a la vista.
    useEffect(() => {
        fijarHiloAbierto(conversacion.clave);
        return () => fijarHiloAbierto(null);
    }, [conversacion.clave]);

    const mandarArchivos = async (lista: FileList | File[] | null | undefined) => {
        const archivos = Array.from(lista ?? []);
        if (!archivos.length || mandandoArchivos) return;
        if (archivos.length > MAX_ARCHIVOS_A_LA_VEZ) toast.message(`Van los ${MAX_ARCHIVOS_A_LA_VEZ} primeros; el resto, en otra tanda.`);
        setMandandoArchivos(true);
        try {
            const res = await enviarArchivosANeurona({ clave: conversacion.clave, destino: conversacion.destino, archivos: archivos.slice(0, MAX_ARCHIVOS_A_LA_VEZ) });
            const fallidos = res.filter((r) => !r.ok);
            if (fallidos.length) toast.error(fallidos[0].aviso || "Algún archivo no pudo salir: mira su tarjeta.");
        } finally {
            setMandandoArchivos(false);
        }
    };

    const alArrastrar = (e: DragEvent<HTMLDivElement>) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        if (!arrastrando) setArrastrando(true);
    };

    // Leída al abrir y cada vez que llega algo con el chat a la vista.
    const ultimoAt = mensajes.length ? mensajes[mensajes.length - 1].at : 0;
    useEffect(() => {
        marcarConversacionLeida(conversacion.clave);
    }, [conversacion.clave, ultimoAt]);

    useLayoutEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [conversacion.clave, mensajes.length]);

    useEffect(() => {
        setTexto("");
        if (!esMovil) areaRef.current?.focus();
    }, [conversacion.clave, esMovil]);

    const enviar = async () => {
        const limpio = texto.trim();
        if (!limpio || enviando) return;
        setEnviando(true);
        setTexto("");
        try {
            const m = await enviarANeurona({ clave: conversacion.clave, destino: conversacion.destino, texto: limpio });
            if (m.estado === "fallido") toast.error(m.aviso || "No se pudo enviar a esta neurona.");
            else if (m.estado === "en-espera") toast.message(m.aviso || "En espera de un medio: sale solo en cuanto haya uno.");
        } finally {
            setEnviando(false);
            areaRef.current?.focus();
        }
    };

    const alTeclear = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void enviar();
        }
    };

    const reintentarTodo = async () => {
        setReintentando(true);
        try {
            const n = await reintentarPendientes();
            toast.message(n ? `Salieron ${n} ${n === 1 ? "mensaje" : "mensajes"}.` : "Aún no hay ningún medio disponible para lo que espera.");
        } finally {
            setReintentando(false);
        }
    };

    const subtitulo = conversacion.propia
        ? `${conversacion.enLinea ? "En línea" : "Desconectada"}${cerebros.length ? ` · ${cerebros.join(" · ")}` : ""}`
        : conversacion.detalle;

    return (
        <div
            className="relative flex h-full min-h-0 flex-col overflow-hidden"
            onDragEnter={alArrastrar}
            onDragOver={alArrastrar}
            onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                setArrastrando(false);
            }}
            onDrop={(e) => {
                if (!e.dataTransfer?.files?.length) return;
                e.preventDefault();
                setArrastrando(false);
                void mandarArchivos(e.dataTransfer.files);
            }}
        >
            {arrastrando && (
                <div
                    className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-[22px] text-center text-white"
                    style={{ background: "rgba(10,12,28,.82)", boxShadow: `inset 0 0 0 2px ${ACENTO.mensajes}aa` }}
                    data-testid="soltar-archivos"
                >
                    <Upload className="h-8 w-8 text-[#b7a6ff]" aria-hidden />
                    <p className="text-[14px] font-semibold">Suelta para mandarlos a {conversacion.nombre}</p>
                    <p className="max-w-xs text-[12px] text-white/65">Cualquier formato, varios a la vez. Viajan por el medio más directo que permitan los ajustes de este chat.</p>
                </div>
            )}
            <header className="flex shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-3 py-2.5 sm:px-4">
                {onAtras && (
                    <button
                        type="button"
                        onClick={onAtras}
                        aria-label="Volver a la lista de neuronas"
                        className="ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/75 hover:bg-white/10 hover:text-white"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                )}
                <IconoNeurona kind={conversacion.kind} propia={conversacion.propia} enLinea={conversacion.enLinea} />
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold text-white">{conversacion.nombre}</h2>
                    <p className="truncate text-[12px] text-white/55">{subtitulo}</p>
                </div>
                <BotonesLlamadaNeurona conversacion={conversacion} compacto={esMovil} />
                <button
                    type="button"
                    onClick={() => setAjustes(true)}
                    title="Medio de transmisión de este chat"
                    aria-label={`Medio de transmisión de este chat: ${resumenPreferencias(medios.efectivas, "neurona")}`}
                    className="ss-redondo inline-flex h-9 max-w-[45%] shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white/85 transition-colors hover:text-white"
                    style={pildoraFantasma(ACENTO.esmeralda, !!medios.propias)}
                >
                    <Route className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{resumenPreferencias(medios.efectivas, "neurona")}</span>
                </button>
                {!esMovil && onAlternarEnfoque && (
                    <button
                        type="button"
                        onClick={onAlternarEnfoque}
                        aria-pressed={!!enfocado}
                        aria-label={enfocado ? "Salir del modo enfoque" : "Modo enfoque: ocultar la lista"}
                        className="ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white"
                    >
                        {enfocado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </button>
                )}
            </header>

            {/* (VER1107B) Versión, medio y aparato de esta neurona de tu cuenta, con «Pedir actualización». */}
            {conversacion.propia && conversacion.destino.neuronDeviceId && (
                <VersionNeurona
                    neuronaId={conversacion.destino.neuronDeviceId}
                    nombre={conversacion.nombre}
                    className="shrink-0 border-b border-white/[0.06] px-3 py-1.5 sm:px-4"
                />
            )}

            {enEspera > 0 && (
                <div className="shrink-0 px-3 pt-2 sm:px-4">
                    <div role="status" className="flex flex-wrap items-center gap-2 rounded-2xl px-3 py-2 text-[12.5px] text-white/85" style={pildoraFantasma(ACENTO.ambar)}>
                        <Clock className="h-4 w-4 shrink-0 text-[#FFBF00]" />
                        <span className="min-w-0 flex-1">
                            {enEspera === 1 ? "1 mensaje espera" : `${enEspera} mensajes esperan`} un medio disponible: sale solo en cuanto haya uno.
                        </span>
                        <button
                            type="button"
                            onClick={() => void reintentarTodo()}
                            disabled={reintentando}
                            className="ss-redondo inline-flex cursor-pointer items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-white/15 disabled:cursor-wait"
                        >
                            {reintentando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reintentar ahora
                        </button>
                    </div>
                </div>
            )}

            <div
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain px-3 py-3 sm:px-5"
                role="log"
                aria-label={`Mensajes con ${conversacion.nombre}`}
                aria-relevant="additions"
            >
                {mensajes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                        <span className="grid h-14 w-14 place-items-center rounded-2xl" style={pildoraFantasma(ACENTO.esmeralda)}>
                            <Route className="h-6 w-6 text-white/85" />
                        </span>
                        <p className="max-w-xs text-[13.5px] text-white/70">
                            Escribe, llama, comparte tu pantalla, transmite en vivo o manda archivos de cualquier formato a {conversacion.nombre}. Cada uno dice por dónde viajó: la malla sin internet, tu red local, internet o el servidor.
                        </p>
                    </div>
                ) : (
                    mensajes.map((m, i) => (
                        <div key={m.id}>
                            {(i === 0 || !mismoDia(mensajes[i - 1].at, m.at)) && <SeparadorDia fecha={new Date(m.at).toISOString()} />}
                            <Burbuja m={m} mostrarVia={medios.mostrarVia} onReintentar={() => void reintentarMensaje(m.clave, m.id)} />
                        </div>
                    ))
                )}
            </div>

            <div className="shrink-0 border-t border-white/[0.06] px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5 sm:px-4">
                <div className="flex items-end gap-2">
                    <input
                        ref={archivoRef}
                        type="file"
                        multiple
                        className="hidden"
                        aria-hidden
                        tabIndex={-1}
                        data-testid="entrada-archivos"
                        onChange={(e) => {
                            const lista = e.target.files ? Array.from(e.target.files) : [];
                            e.target.value = "";
                            void mandarArchivos(lista);
                        }}
                    />
                    <button
                        type="button"
                        onClick={() => archivoRef.current?.click()}
                        disabled={mandandoArchivos}
                        aria-label={`Mandar archivos a ${conversacion.nombre}`}
                        title={`Archivos de cualquier formato (también arrastrándolos). ${AVISO_LIMITES_MEDIOS}`}
                        className="ss-redondo grid h-[42px] w-[42px] shrink-0 cursor-pointer place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
                    >
                        {mandandoArchivos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => setTransmitir(true)}
                        aria-label={`Transmitir en vivo a ${conversacion.nombre}`}
                        title="Transmitir en vivo (texto que llega mientras lo escribes)"
                        className="ss-redondo grid h-[42px] w-[42px] shrink-0 cursor-pointer place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <Radio className="h-4 w-4" />
                    </button>
                    <textarea
                        ref={areaRef}
                        value={texto}
                        onChange={(e) => setTexto(e.target.value.slice(0, 4000))}
                        onKeyDown={alTeclear}
                        rows={Math.min(5, Math.max(1, texto.split("\n").length))}
                        placeholder={`Mensaje a ${conversacion.nombre}`}
                        aria-label={`Mensaje a ${conversacion.nombre}`}
                        className="min-h-[42px] min-w-0 flex-1 resize-none rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/40 focus:border-[#7C5CFF]/60 focus:outline-none"
                    />
                    <button
                        type="button"
                        onClick={() => void enviar()}
                        disabled={!texto.trim() || enviando}
                        aria-label="Enviar"
                        className="ss-redondo grid h-[42px] w-[42px] shrink-0 cursor-pointer place-items-center rounded-full text-white transition-transform duration-150 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ background: ACENTO.mensajes }}
                    >
                        {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                    </button>
                </div>
            </div>

            <Dialog open={ajustes} onOpenChange={setAjustes}>
                <DialogContent className="max-md:left-0 max-md:top-0 max-md:h-[100dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none md:max-h-[86vh] md:max-w-xl border-white/10 bg-[rgba(10,12,28,0.96)] p-0 backdrop-blur-2xl sm:rounded-[24px]">
                    <div className="flex h-full min-h-0 flex-col">
                        <DialogHeader className="shrink-0 border-b border-white/[0.08] px-5 pb-4 pt-5 pr-14 text-left">
                            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                                <Route className="h-4 w-4 text-[#10B981]" /> Medio de transmisión
                            </DialogTitle>
                            <DialogDescription className="text-[13px] text-white/60">
                                <span className="font-medium text-white/85">{conversacion.nombre}</span> · Solo para este chat; lo demás sigue los ajustes generales.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                            <BloqueMedioTransmision tipo="neurona" clave={clavePrefs} />
                            <p className="mt-3 text-[12px] text-white/55">{AVISO_LIMITES_MEDIOS}</p>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog open={transmitir} onOpenChange={setTransmitir}>
                <DialogContent className="max-md:left-0 max-md:top-0 max-md:h-[100dvh] max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none md:max-w-lg border-white/10 bg-[rgba(10,12,28,0.96)] backdrop-blur-2xl sm:rounded-[24px]">
                    <DialogHeader className="text-left">
                        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                            <Radio className="h-4 w-4 text-[#39FF14]" /> Transmitir en vivo
                        </DialogTitle>
                        <DialogDescription className="text-[13px] text-white/60">
                            A <span className="font-medium text-white/85">{conversacion.nombre}</span>
                        </DialogDescription>
                    </DialogHeader>
                    {transmitir && <PanelTransmitir conversacion={conversacion} onCerrar={() => setTransmitir(false)} />}
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default HiloNeurona;
