"use client";

/**
 * Datos de cualquier formato en un chat de neurona (NEU1107A · 2026-11-07): tarjetas de archivo,
 * llamada y transmisión en vivo dentro de las burbujas, los botones de llamada de la cabecera y el
 * panel de «Transmitir en vivo». Lo pesado (motor de archivos, llamadas, transporte) va perezoso
 * en `archivos-neurona.ts`, `llamadas-neurona.ts` y `flujos-neurona.ts`.
 */

import { useEffect, useRef, useState } from "react";
import {
    Check, Download, FileText, Loader2, MonitorUp, Phone, PhoneIncoming, Radio, RotateCcw, ShieldCheck, Video, X,
} from "lucide-react";
import { toast } from "sonner";
import { avisarFalloMedios } from "@/lib/llamadas/aviso-medios";
import { cn } from "@/lib/utils";
import { ACENTO, pildoraFantasma } from "@/components/messages/marco/estilos";
import type { MensajeMalla } from "@/lib/mensajeria/neuronas/bandeja";
import type { ConversacionNeurona } from "@/lib/mensajeria/neuronas/agrupar";
import {
    confirmacionesArchivo,
    faseDesdeMotor,
    motivoArchivoLegible,
    porcentajeTransferencia,
    rutaDeArchivo,
    tamanoLegible,
    textoFaseArchivo,
    textoLlamada,
    textoRegistroLlamada,
    tipoSeguroPara,
    vistaPrevia,
    type FaseArchivoNeurona,
} from "@/lib/mensajeria/neuronas/datos-neurona";
import { juntarBinario, resumenFlujo } from "@/lib/mensajeria/neuronas/flujo-datos";
import {
    aceptarArchivo,
    archivoDeAdjunto,
    bajarArchivoServidor,
    cancelarArchivo,
    enviarArchivosAChatMalla,
    rechazarArchivo,
    reintentarArchivoNeurona,
    useArchivoVivo,
} from "@/lib/mensajeria/neuronas/archivos-neurona";
import { abrirFlujoNeurona, cerrarFlujoNeurona, useFlujoNeurona, type FlujoAbierto } from "@/lib/mensajeria/neuronas/flujos-neurona";
import { llamarANeurona, llamarEnChatMalla, pedirPantalla, type TipoLlamadaNeurona } from "@/lib/mensajeria/neuronas/llamadas-neurona";

const BOTON_TARJETA =
    "ss-redondo inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white transition-colors disabled:cursor-wait disabled:opacity-60";

/** Para la vista previa: tope de lo que se lee como texto. */
const MAX_TEXTO_VISTA = 4000;

function Confirmaciones({ enviado, recibido, verificado }: { enviado: boolean; recibido: boolean; verificado: boolean }) {
    const item = (ok: boolean, texto: string) => (
        <span className={cn("inline-flex items-center gap-0.5", ok ? "text-white/85" : "text-white/35")}>
            {ok ? <Check className="h-3 w-3" aria-hidden /> : <span className="inline-block h-3 w-3 rounded-full border border-current" aria-hidden />}
            {texto}
        </span>
    );
    return (
        <p className="flex flex-wrap items-center gap-2 text-[10.5px]" aria-label={`Enviado: ${enviado ? "sí" : "no"}; recibido: ${recibido ? "sí" : "no"}; verificado: ${verificado ? "sí" : "no"}`}>
            {item(enviado, "Enviado")}
            {item(recibido, "Recibido")}
            {item(verificado, "Verificado")}
        </p>
    );
}

function descargar(blob: Blob, nombre: string): void {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
        toast.error("No se pudo guardar el archivo.");
    }
}

/* ══════════════════════════ Archivo ══════════════════════════ */

export function TarjetaArchivo({ m }: { m: MensajeMalla }) {
    const adj = m.adjunto;
    const vivo = useArchivoVivo(adj?.modo === "p2p" ? adj.id : undefined);
    const [vistaUrl, setVistaUrl] = useState<string | null>(null);
    const [texto, setTexto] = useState<string | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const dir = m.dir;
    const fase: FaseArchivoNeurona | null = vivo
        ? faseDesdeMotor(vivo.fase)
        : m.archivo?.fase ?? (adj?.modo === "servidor" ? "disponible" : null);
    const porcentaje = vivo ? porcentajeTransferencia(vivo.progreso, vivo.trozos) : m.archivo?.porcentaje ?? null;
    const vista = vistaPrevia(adj?.tipo, adj?.nombre);
    // Se puede enseñar si el archivo entero está aquí: lo mandé yo, o llegó verificado/guardado.
    const aqui = dir === "sale" || fase === "verificado" || !!m.archivo?.guardado;

    const adjId = adj?.id;
    const adjTipo = adj?.tipo;
    useEffect(() => {
        // PDF y lo que no se puede enseñar: solo «Guardar» (nunca se ejecuta nada recibido).
        if (!adjId || !aqui || vista === "descarga" || vista === "pdf") return;
        let vivoEfecto = true;
        let url: string | null = null;
        void archivoDeAdjunto(adjId).then(async (blob) => {
            if (!blob || !vivoEfecto) return;
            if (vista === "texto") {
                const t = await blob.slice(0, MAX_TEXTO_VISTA).text().catch(() => null);
                if (vivoEfecto) setTexto(t);
                return;
            }
            url = URL.createObjectURL(new Blob([blob], { type: tipoSeguroPara(vista, adjTipo) }));
            if (vivoEfecto) setVistaUrl(url);
            else URL.revokeObjectURL(url);
        });
        return () => {
            vivoEfecto = false;
            if (url) URL.revokeObjectURL(url);
        };
    }, [adjId, adjTipo, aqui, vista]);

    if (!adj) return null;
    const conf = fase ? confirmacionesArchivo(fase, dir) : { enviado: dir === "entra", recibido: false, verificado: false };
    const estadoTexto = fase ? textoFaseArchivo(fase, dir, porcentaje) : "Esperando el archivo…";
    const viajando = fase === "ofrecido" || fase === "transfiriendo" || fase === "reintentando" || fase === "verificando";

    const accion = async (f: () => Promise<unknown>) => {
        setOcupado(true);
        try {
            await f();
        } finally {
            setOcupado(false);
        }
    };

    return (
        <div className="mb-1 min-w-[220px] space-y-1.5" data-testid="tarjeta-archivo">
            <div className="flex items-start gap-2">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={pildoraFantasma(ACENTO.aurora)}>
                    <FileText className="h-4 w-4 text-white/85" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-white" title={adj.nombre}>{adj.nombre}</p>
                    <p className="text-[11px] text-white/60">
                        {tamanoLegible(adj.tamano)} · {adj.modo === "p2p" ? "por la malla" : "almacenamiento de la cuenta"}
                    </p>
                </div>
            </div>
            {vista === "imagen" && vistaUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={vistaUrl} alt={adj.nombre} className="max-h-64 w-full rounded-xl object-contain" />
            )}
            {vista === "audio" && vistaUrl && <audio src={vistaUrl} controls className="w-full" />}
            {vista === "video" && vistaUrl && <video src={vistaUrl} controls playsInline className="max-h-64 w-full rounded-xl bg-black" />}
            {vista === "texto" && texto !== null && (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/25 p-2 text-[11.5px] text-white/85">{texto}</pre>
            )}
            {viajando && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={porcentaje === null ? undefined : Math.round(porcentaje)}>
                    <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${Math.max(4, porcentaje ?? 4)}%`, background: ACENTO.esmeralda }} />
                </div>
            )}
            <p className="flex items-center gap-1 text-[11.5px] text-white/80" role="status">
                {fase === "verificado" && <ShieldCheck className="h-3.5 w-3.5 text-[#10B981]" aria-hidden />}
                {(fase === "preparando" || fase === "subiendo" || fase === "verificando") && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
                {estadoTexto}
            </p>
            {(vivo?.motivo || m.archivo?.motivo) && fase !== "verificado" && (
                <p className="text-[11px] text-white/55">{motivoArchivoLegible(vivo?.motivo ?? m.archivo?.motivo, dir)}</p>
            )}
            {/* (ARC1108A) Si falló: por qué camino iba (los dos de «Red local (app nativa)» no son el mismo). */}
            {fase === "error" && adj.modo === "p2p" && (
                <p className="text-[11px] text-white/55" data-testid="ruta-archivo-error">
                    Ruta: {rutaDeArchivo(m.via, m.archivo?.enlaces)}
                </p>
            )}
            <Confirmaciones {...conf} />
            <div className="flex flex-wrap gap-1.5">
                {dir === "entra" && fase === "por-aceptar" && (
                    <>
                        <button type="button" disabled={ocupado} onClick={() => void accion(() => aceptarArchivo(adj.id))} className={BOTON_TARJETA} style={{ background: ACENTO.esmeralda }}>
                            <Check className="h-3.5 w-3.5" /> Aceptar
                        </button>
                        <button type="button" disabled={ocupado} onClick={() => void accion(() => rechazarArchivo(adj.id))} className={BOTON_TARJETA} style={{ background: "rgba(255,255,255,.14)" }}>
                            <X className="h-3.5 w-3.5" /> Rechazar
                        </button>
                    </>
                )}
                {viajando && adj.modo === "p2p" && (
                    <button type="button" disabled={ocupado} onClick={() => void accion(() => cancelarArchivo(adj.id))} className={BOTON_TARJETA} style={{ background: "rgba(255,255,255,.14)" }}>
                        <X className="h-3.5 w-3.5" /> Cancelar
                    </button>
                )}
                {dir === "sale" && (fase === "interrumpido" || fase === "error" || fase === "cancelado" || fase === "rechazado") && (
                    <button type="button" disabled={ocupado} onClick={() => void accion(() => reintentarArchivoNeurona(m))} className={BOTON_TARJETA} style={{ background: "rgba(255,255,255,.18)" }}>
                        <RotateCcw className="h-3.5 w-3.5" /> {fase === "interrumpido" ? "Reanudar" : "Reintentar"}
                    </button>
                )}
                {dir === "entra" && adj.modo === "servidor" && !m.archivo?.guardado && fase !== "transfiriendo" && (
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() =>
                            void accion(async () => {
                                const r = await bajarArchivoServidor(m);
                                if (!r.ok && r.motivo) toast.error(r.motivo);
                            })
                        }
                        className={BOTON_TARJETA}
                        style={{ background: ACENTO.aurora }}
                    >
                        <Download className="h-3.5 w-3.5" /> Bajar y verificar
                    </button>
                )}
                {aqui && (
                    <button
                        type="button"
                        disabled={ocupado}
                        onClick={() =>
                            void accion(async () => {
                                const blob = await archivoDeAdjunto(adj.id);
                                if (blob) descargar(new Blob([blob], { type: tipoSeguroPara(vista, adj.tipo) }), adj.nombre);
                                else toast.error("Este aparato ya no tiene el archivo.");
                            })
                        }
                        className={BOTON_TARJETA}
                        style={{ background: "rgba(255,255,255,.14)" }}
                    >
                        <Download className="h-3.5 w-3.5" /> {vista === "pdf" ? "Abrir / guardar PDF" : "Guardar"}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ══════════════════════════ Llamada ══════════════════════════ */

export function TarjetaLlamada({ m }: { m: MensajeMalla }) {
    const ll = m.llamada;
    if (!ll) return null;
    const Icono = ll.pantalla ? MonitorUp : ll.tipo === "video" ? Video : m.dir === "entra" ? PhoneIncoming : Phone;
    const sono = !!m.via?.confirmado;
    const r = m.registroLlamada;
    const contestada = !!r && (r.fase === "en-curso" || r.fase === "terminada");
    return (
        <div className="mb-1 min-w-[200px] space-y-1" data-testid="tarjeta-llamada">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                <Icono className="h-4 w-4 text-white/85" aria-hidden />
                {textoLlamada(ll, m.dir)}
            </p>
            <p className="text-[12px] text-white/75" role="status">{textoRegistroLlamada(r, m.dir)}</p>
            {r?.motivo && r.fase !== "en-curso" && <p className="text-[11px] text-white/55">{r.motivo}</p>}
            {m.dir === "sale" && <Confirmaciones enviado={m.estado !== "fallido"} recibido={sono || contestada} verificado={contestada} />}
        </div>
    );
}

/* ══════════════════════════ Transmisión en vivo ══════════════════════════ */

/** (GRP1107A) Reproduce lo que llega de una transmisión de audio/vídeo por canal de datos. */
function ReproductorFlujo({ id, mime }: { id: string; mime: string }) {
    const ref = useRef<HTMLVideoElement & HTMLAudioElement>(null);
    const esVideo = mime.startsWith("video/");
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        let baja: (() => void) | null = null;
        let vivo = true;
        void import("@/lib/mensajeria/neuronas/transmision-medios")
            .then((t) => {
                if (vivo) baja = t.crearReproductorMedios(el, id, mime);
            })
            .catch(() => undefined);
        return () => {
            vivo = false;
            baja?.();
        };
    }, [id, mime]);
    return esVideo ? (
        <video ref={ref} className="w-full max-w-[360px] rounded-xl bg-black" playsInline autoPlay controls aria-label="Vídeo en vivo" data-testid="reproductor-flujo" />
    ) : (
        <audio ref={ref} autoPlay controls aria-label="Audio en vivo" data-testid="reproductor-flujo" />
    );
}

export function TarjetaFlujo({ m }: { m: MensajeMalla }) {
    const ref = m.flujo;
    const e = useFlujoNeurona(ref?.id);
    if (!ref) return null;
    return (
        <div className="mb-1 min-w-[220px] space-y-1.5" data-testid="tarjeta-flujo">
            <p className="flex items-center gap-2 text-[13.5px] font-semibold text-white">
                <Radio className={cn("h-4 w-4", e?.abierto ? "text-[#39FF14]" : "text-white/70")} aria-hidden />
                {ref.nombre}
                {e?.abierto && (
                    <span className="rounded-full px-1.5 text-[10px] font-bold uppercase tracking-wide text-[#0a0c1c]" style={{ background: ACENTO.lima }}>
                        En vivo
                    </span>
                )}
            </p>
            {!e ? (
                <p className="text-[11.5px] text-white/60">Transmisión en vivo ({ref.formato}). Lo vivo no se guarda: solo se vio en la pestaña que estaba abierta.</p>
            ) : (
                <>
                    {e.formato === "texto" && <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/25 p-2 text-[12px] text-white/90">{e.texto || "…"}</pre>}
                    {e.formato === "json" && (
                        <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-black/25 p-2 text-[11px] text-white/85">
                            {(e.registros ?? []).slice(-5).map((r) => (typeof r === "string" ? r : JSON.stringify(r))).join("\n")}
                        </pre>
                    )}
                    {e.formato === "medios" && e.dir === "entra" && e.abierto && <ReproductorFlujo id={e.id} mime={e.mime ?? "video/webm"} />}
                    {e.formato === "medios" && (
                        <p className="text-[11px] text-white/55">Audio/vídeo por canal de datos (sin WebRTC de medios): llega en trozos de ~2 s, con ese retraso.</p>
                    )}
                    <p className="text-[11px] text-white/65" role="status">
                        {resumenFlujo(e)}
                        {e.dir === "sale" && typeof e.recibidosOtro === "number" ? ` · le llegaron ${e.recibidosOtro}` : ""}
                        {!e.abierto ? ` · terminada${e.motivoCierre ? ` (${e.motivoCierre})` : ""}` : ""}
                    </p>
                    {e.dir === "sale" && <Confirmaciones enviado={e.trozos > 0} recibido={(e.recibidosOtro ?? 0) > 0} verificado={!e.abierto && (e.recibidosOtro ?? 0) >= e.trozos && e.trozos > 0} />}
                    <div className="flex flex-wrap gap-1.5">
                        {e.dir === "sale" && e.abierto && (
                            <button type="button" onClick={() => cerrarFlujoNeurona(e.id)} className={BOTON_TARJETA} style={{ background: "rgba(255,255,255,.18)" }}>
                                <X className="h-3.5 w-3.5" /> Terminar
                            </button>
                        )}
                        {e.dir === "entra" && !e.abierto && e.formato === "binario" && (e.partes?.length ?? 0) > 0 && (
                            <button
                                type="button"
                                onClick={() => descargar(new Blob([juntarBinario(e.partes ?? [])], { type: "application/octet-stream" }), `${e.nombre}.bin`)}
                                className={BOTON_TARJETA}
                                style={{ background: "rgba(255,255,255,.14)" }}
                            >
                                <Download className="h-3.5 w-3.5" /> Guardar
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

/* ══════════════════════════ Botones de la cabecera ══════════════════════════ */

const BOTON_CABECERA =
    "ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50";

export function BotonesLlamadaNeurona({ conversacion, compacto = false }: { conversacion: ConversacionNeurona; compacto?: boolean }) {
    const [ocupado, setOcupado] = useState<TipoLlamadaNeurona | null>(null);
    const llamar = (tipo: TipoLlamadaNeurona) => {
        if (ocupado) return;
        // La pantalla se pide YA, en el mismo gesto (el navegador solo la da ahí).
        const pantalla = tipo === "pantalla" ? pedirPantalla() : undefined;
        setOcupado(tipo);
        void llamarANeurona({ conversacion, tipo, pantalla })
            .then((r) => {
                if (!r.ok) avisarFalloMedios(r.motivo ?? "No se pudo llamar a esta neurona.", r.ajustes);
            })
            .finally(() => setOcupado(null));
    };
    const boton = (tipo: TipoLlamadaNeurona, Icono: typeof Phone, etiqueta: string) => (
        <button type="button" onClick={() => llamar(tipo)} disabled={!!ocupado} aria-label={etiqueta} title={etiqueta} className={BOTON_CABECERA}>
            {ocupado === tipo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icono className="h-4 w-4" />}
        </button>
    );
    return (
        <div className="flex shrink-0 items-center" role="group" aria-label={`Llamar a ${conversacion.nombre}`}>
            {boton("audio", Phone, `Llamada de voz con ${conversacion.nombre}`)}
            {boton("video", Video, `Videollamada con ${conversacion.nombre}`)}
            {!compacto && boton("pantalla", MonitorUp, `Compartir tu pantalla con ${conversacion.nombre}`)}
        </div>
    );
}

/* ══════════════════════════ Chats y grupos por la malla ══════════════════════════ */

/**
 * Barra de un chat 1:1 o de grupo cuyo medio elegido es la malla (o sin internet): archivos de
 * cualquier formato P2P a cada persona del chat y, en un 1:1, llamada directa por el enlace sin
 * internet (voz, vídeo o pantalla). Reutiliza los mismos motores que los chats de neuronas.
 */
export function BarraMallaChat({ hiloId, tipo, otros, nombre }: { hiloId: string; tipo: "dm" | "grupo"; otros: string[]; nombre: string }) {
    const ref = useRef<HTMLInputElement>(null);
    const [ocupado, setOcupado] = useState<string | null>(null);
    const mandar = async (lista: File[]) => {
        if (!lista.length || ocupado) return;
        setOcupado("archivos");
        try {
            const res = await enviarArchivosAChatMalla({ hiloId, tipo, otros, archivos: lista.slice(0, 20) });
            const fallo = res.find((r) => !r.ok);
            if (fallo) toast.error(fallo.aviso || "Algún archivo no pudo salir por la malla: mira su tarjeta.");
        } finally {
            setOcupado(null);
        }
    };
    const llamar = (t: TipoLlamadaNeurona) => {
        if (ocupado || !otros[0]) return;
        const pantalla = t === "pantalla" ? pedirPantalla() : undefined;
        setOcupado(t);
        void llamarEnChatMalla({ hiloId, tipoChat: tipo, otroUid: otros[0], tipo: t, pantalla })
            .then((r) => {
                if (!r.ok) avisarFalloMedios(r.motivo ?? "No se pudo llamar por la malla.", r.ajustes);
            })
            .finally(() => setOcupado(null));
    };
    // (GRP1107A) Grupo sin servidor: malla completa por los enlaces sin internet de cada par.
    const llamarGrupo = (t: "audio" | "video") => {
        if (ocupado || !otros.length) return;
        setOcupado(`grupo-${t}`);
        void import("@/lib/llamadas/grupo-malla-motor")
            .then((g) => g.empezarLlamadaGrupoMalla({ hiloId, tipoChat: "grupo", tipo: t, titulo: nombre, miembros: otros }))
            .then((r) => {
                if (!r.ok) toast.error(r.motivo ?? "No se pudo llamar al grupo por la malla.");
            })
            .catch(() => toast.error("No se pudo llamar al grupo por la malla."))
            .finally(() => setOcupado(null));
    };
    const boton = (clave: string, Icono: typeof Phone, texto: string, onClick: () => void) => (
        <button
            type="button"
            onClick={onClick}
            disabled={!!ocupado}
            className="ss-redondo inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white/85 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-wait disabled:opacity-50"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }}
        >
            {ocupado === clave ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icono className="h-3.5 w-3.5" />} {texto}
        </button>
    );
    return (
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2 sm:px-5" role="group" aria-label="Por la malla" data-testid="barra-malla-chat">
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] font-semibold text-white/85" style={pildoraFantasma(ACENTO.esmeralda)}>
                <Radio className="h-3.5 w-3.5" aria-hidden /> Por la malla
            </span>
            <input
                ref={ref}
                type="file"
                multiple
                className="hidden"
                aria-hidden
                tabIndex={-1}
                onChange={(e) => {
                    const lista = e.target.files ? Array.from(e.target.files) : [];
                    e.target.value = "";
                    void mandar(lista);
                }}
            />
            {boton("archivos", FileText, tipo === "grupo" ? "Archivos a cada miembro" : "Archivos", () => ref.current?.click())}
            {tipo === "dm" && otros.length === 1 && (
                <>
                    {boton("audio", Phone, "Llamada directa", () => llamar("audio"))}
                    {boton("video", Video, "Vídeo", () => llamar("video"))}
                    {boton("pantalla", MonitorUp, "Pantalla", () => llamar("pantalla"))}
                </>
            )}
            {tipo === "grupo" && otros.length > 0 && (
                <>
                    {boton("grupo-audio", Phone, "Llamada de grupo", () => llamarGrupo("audio"))}
                    {boton("grupo-video", Video, "Vídeo de grupo", () => llamarGrupo("video"))}
                </>
            )}
            <span className="sr-only">Chat con {nombre}</span>
        </div>
    );
}

/** Tarjeta de un archivo o una llamada que viajó por la malla en un chat o grupo. */
export function TarjetaDatosMalla({ m }: { m: MensajeMalla }) {
    if (!m.adjunto && !m.llamada) return null;
    const mio = m.dir === "sale";
    return (
        <div className={cn("mt-1 flex", mio ? "justify-end" : "justify-start")}>
            <div
                className="max-w-[min(420px,82%)] rounded-[18px] px-3.5 py-2"
                style={mio ? { background: "rgba(124,92,255,.22)", boxShadow: "inset 0 0 0 1px rgba(124,92,255,.4)" } : { background: "rgba(255,255,255,.065)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08)" }}
            >
                {m.adjunto && <TarjetaArchivo m={m} />}
                {m.llamada && <TarjetaLlamada m={m} />}
            </div>
        </div>
    );
}

/* ══════════════════════════ Transmitir en vivo (texto, y GRP1107A: voz, vídeo, pantalla) ══════════════════════════ */

/** Cada cuánto sale el texto mientras se escribe (ms). */
const RITMO_TEXTO_MS = 150;

type ModoTransmitir = "texto" | "audio" | "video" | "pantalla";

const MODOS_TRANSMITIR: Array<[ModoTransmitir, string, typeof Phone]> = [
    ["texto", "Texto", FileText],
    ["audio", "Voz", Phone],
    ["video", "Vídeo", Video],
    ["pantalla", "Pantalla", MonitorUp],
];

/**
 * (GRP1107A) Audio, vídeo o pantalla en vivo por CANAL DE DATOS (cuando no hay WebRTC de medios con
 * esa neurona: malla de la cuenta, vínculo entre cuentas…). Ritmo ajustado al tope medido.
 */
function TransmitirMedios({ conversacion, modo, onCerrar }: { conversacion: ConversacionNeurona; modo: Exclude<ModoTransmitir, "texto">; onCerrar: () => void }) {
    type Control = import("@/lib/mensajeria/neuronas/transmision-medios").ControlTransmision;
    type Estado = import("@/lib/mensajeria/neuronas/transmision-medios").EstadoTransmision;
    const [abriendo, setAbriendo] = useState(false);
    const [estado, setEstado] = useState<Estado | null>(null);
    const control = useRef<Control | null>(null);
    useEffect(() => () => control.current?.parar(), []);
    const empezar = () => {
        if (abriendo) return;
        // La pantalla se pide YA, en el mismo gesto (el navegador solo la da ahí).
        const pantalla = modo === "pantalla" ? pedirPantalla() : undefined;
        setAbriendo(true);
        void import("@/lib/mensajeria/neuronas/transmision-medios")
            .then((t) => t.transmitirMedios({ conversacion, tipo: modo, pantalla }))
            .then((r) => {
                if (!r.ok) {
                    avisarFalloMedios(r.motivo, r.ajustes);
                    return;
                }
                control.current = r.control;
                setEstado(r.control.estado());
                r.control.suscribir(setEstado);
            })
            .catch(() => toast.error("No se pudo empezar la transmisión."))
            .finally(() => setAbriendo(false));
    };
    const terminar = () => {
        control.current?.parar();
        control.current = null;
        onCerrar();
    };
    return (
        <div className="space-y-2" data-testid="transmitir-medios">
            <p className="text-[12.5px] text-white/70">
                {modo === "audio" ? "Tu voz" : modo === "video" ? "Tu cámara y tu voz" : "Tu pantalla"} llega a {conversacion.nombre} por un canal de DATOS de la malla, en trozos de ~2 s (con ese retraso), al ritmo que el enlace demuestra llevar. Es para cuando no hay llamada directa: con un enlace sin internet, la llamada va mejor.
            </p>
            {estado && (
                <p className="text-[11.5px] text-white/65" role="status">
                    {estado.activa ? "En vivo" : `Terminada${estado.motivoFin ? ` (${estado.motivoFin})` : ""}`} · {estado.via} · {estado.texto}
                </p>
            )}
            <div className="flex justify-end gap-2">
                {!estado?.activa ? (
                    <button type="button" onClick={empezar} disabled={abriendo} className={BOTON_TARJETA} style={{ background: ACENTO.mensajes }}>
                        {abriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />} Empezar a transmitir
                    </button>
                ) : (
                    <button type="button" onClick={terminar} className={BOTON_TARJETA} style={{ background: "rgba(255,255,255,.18)" }}>
                        <X className="h-3.5 w-3.5" /> Terminar
                    </button>
                )}
            </div>
        </div>
    );
}

export function PanelTransmitir({ conversacion, onCerrar }: { conversacion: ConversacionNeurona; onCerrar: () => void }) {
    const [modo, setModo] = useState<ModoTransmitir>("texto");
    const selector = (
        <div role="group" aria-label="Qué transmitir" className="flex flex-wrap gap-1.5">
            {MODOS_TRANSMITIR.map(([m, etiqueta, Icono]) => (
                <button
                    key={m}
                    type="button"
                    aria-pressed={modo === m}
                    onClick={() => setModo(m)}
                    className={cn("ss-redondo inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors", modo === m ? "text-white" : "text-white/60 hover:text-white")}
                    style={pildoraFantasma(ACENTO.esmeralda, modo === m)}
                >
                    <Icono className="h-3.5 w-3.5" aria-hidden /> {etiqueta}
                </button>
            ))}
        </div>
    );
    return (
        <div className="space-y-3">
            {selector}
            {modo === "texto" ? <PanelTransmitirTexto conversacion={conversacion} onCerrar={onCerrar} /> : <TransmitirMedios key={modo} conversacion={conversacion} modo={modo} onCerrar={onCerrar} />}
        </div>
    );
}

function PanelTransmitirTexto({ conversacion, onCerrar }: { conversacion: ConversacionNeurona; onCerrar: () => void }) {
    const [nombre, setNombre] = useState("Texto en vivo");
    const [texto, setTexto] = useState("");
    const [abriendo, setAbriendo] = useState(false);
    const flujoRef = useRef<FlujoAbierto | null>(null);
    const [flujoId, setFlujoId] = useState<string | null>(null);
    const e = useFlujoNeurona(flujoId ?? undefined);
    const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (temporizador.current) clearTimeout(temporizador.current);
            flujoRef.current?.cerrar();
        },
        [],
    );

    const empezar = async () => {
        setAbriendo(true);
        try {
            const r = await abrirFlujoNeurona({ conversacion, nombre, formato: "texto" });
            if (!r.ok) {
                toast.error(r.motivo);
                return;
            }
            flujoRef.current = r.flujo;
            setFlujoId(r.flujo.id);
            if (texto) r.flujo.enviar(texto);
        } finally {
            setAbriendo(false);
        }
    };

    const alEscribir = (v: string) => {
        setTexto(v);
        if (!flujoRef.current) return;
        if (temporizador.current) clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => flujoRef.current?.enviar(v), RITMO_TEXTO_MS);
    };

    const terminar = () => {
        if (temporizador.current) clearTimeout(temporizador.current);
        if (flujoRef.current) flujoRef.current.enviar(texto);
        flujoRef.current?.cerrar();
        flujoRef.current = null;
        onCerrar();
    };

    return (
        <div className="space-y-3" data-testid="panel-transmitir">
            <p className="text-[12.5px] text-white/70">
                Lo que escribas llega a {conversacion.nombre} mientras lo escribes, por el medio más directo que permitan los ajustes de este chat. No se guarda: es en vivo.
            </p>
            {!flujoId && (
                <label className="block text-[12px] text-white/70">
                    Nombre
                    <input
                        value={nombre}
                        onChange={(ev) => setNombre(ev.target.value.slice(0, 80))}
                        className="mt-1 w-full rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13.5px] text-white focus:border-[#7C5CFF]/60 focus:outline-none"
                    />
                </label>
            )}
            <textarea
                value={texto}
                onChange={(ev) => alEscribir(ev.target.value.slice(0, 12_000))}
                rows={6}
                placeholder="Escribe aquí…"
                aria-label="Texto en vivo"
                className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white placeholder:text-white/40 focus:border-[#7C5CFF]/60 focus:outline-none"
            />
            {e && <p className="text-[11.5px] text-white/60" role="status">{resumenFlujo(e)}{typeof e.recibidosOtro === "number" ? ` · le llegaron ${e.recibidosOtro}` : ""}</p>}
            <div className="flex justify-end gap-2">
                {!flujoId ? (
                    <button type="button" onClick={() => void empezar()} disabled={abriendo} className={BOTON_TARJETA} style={{ background: ACENTO.mensajes }}>
                        {abriendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Radio className="h-3.5 w-3.5" />} Empezar a transmitir
                    </button>
                ) : (
                    <button type="button" onClick={terminar} className={BOTON_TARJETA} style={{ background: "rgba(255,255,255,.18)" }}>
                        <X className="h-3.5 w-3.5" /> Terminar
                    </button>
                )}
            </div>
        </div>
    );
}
