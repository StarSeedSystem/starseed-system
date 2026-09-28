"use client";

/*
 * MessageBubble — burbuja de un mensaje de hilo real (os_dm_messages). Rediseño 2026-09-28:
 * las mías con el degradado de MI color, las de los demás de cristal; agrupación de seguidas
 * (cola sutil solo en la última), hora + marcas de lectura, respuesta citada, mensajes
 * enriquecidos (MensajeFormateado), apps en vivo y llamadas como tarjeta, y acciones en un
 * menú vertical (hover en escritorio, pulsación larga en táctil). Las imágenes cuya URL ya no
 * existe (proyecto de Supabase antiguo) se ven como una tarjeta elegante, nunca rotas.
 */

import { useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
    Ban, Bot, Check, CheckCheck, Copy, ExternalLink, FileIcon, ImageDown, ImageOff, Maximize2, MoreVertical,
    Music, Pencil, Reply, Server, Trash2, VideoOff, X,
} from "lucide-react";
import { MessageRenderer } from "@/components/aurora/message-renderer";
import { SaveToLibrary } from "@/components/library/save-to-library";
import type { SaveItemInput } from "@/lib/library/entity-library";
import type { DmAttachment, DmMessage } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";
import type { AjustesApariencia } from "@/lib/mensajeria/ajustes-tipos";
import type { CategoriaArchivo } from "@/lib/mensajeria/carpetas-tipos";
// Invitaciones (grupo/página/evento) y referencias vivas de "Contenido de la
// red" (Adenda jul-2026): mismo render compartido con Correos/Comentarios.
import { UniversalAttachmentView, isInviteLike, isNetworkRefLike } from "@/components/files/universal-attachment-view";
// Previsualización rica (pdf/código/genérico descargable — Requisito 4).
import { FilePreview } from "@/components/files/file-preview";
// Marcos de forma en adjuntos imagen/vídeo (Ola 224 · Adenda 219).
import { FotoConMarco } from "@/components/profile/foto-con-marco";
import type { Marco } from "@/lib/profile/marco-foto";
// Contratos de otros agentes (C4, C5, C6, C7).
import { MensajeFormateado } from "@/components/messages/rico/mensaje-formateado";
import { TarjetaLlamada } from "@/components/llamadas/tarjeta-llamada";
import { TarjetaVivo } from "@/components/messages/vivo/tarjeta-vivo";
import { urlVigenteAdjunto } from "@/lib/mensajeria/adjuntos";
import { useContextoHilo, type NuevoItemCarpeta } from "@/components/messages/dm/contexto-hilo";
import { SubmenuGuardarEnCarpeta } from "@/components/messages/dm/menu-guardar-carpeta";
import { usePulsacionLarga } from "@/components/messages/dm/hooks-hilo";
import {
    esColorClaro, formatearHora, formatoDe, partirResaltado, plegar, sombrear, textoBuscable, type EstadoLectura,
} from "@/components/messages/dm/utilidades-hilo";
import estilos from "@/components/messages/dm/hilo.module.css";

/** Tipo de la Biblioteca para mensajes (contrato C8). */
const TIPO_MENSAJE_BIBLIOTECA: SaveItemInput["type"] = "message";

/**
 * Extrae el marco de forma guardado en el adjunto si existe (Adenda 219).
 * El marco viaja como campo extra opcional en la estructura JSON del adjunto.
 */
export function marcoDeAdjunto(attachment: DmAttachment): Marco | null {
    const m = (attachment as DmAttachment & { marco?: unknown }).marco;
    return m && typeof m === "object" ? (m as Marco) : null;
}

/** Categoría de un adjunto para las carpetas del chat. */
export function categoriaDeAdjunto(a: DmAttachment): CategoriaArchivo {
    if (a.kind === "image") return "imagen";
    if (a.kind === "video") return "video";
    if (a.kind === "audio") return "audio";
    if (a.kind === "vivo") return "vivo";
    if (a.kind === "llamada") return "llamada";
    if (a.kind === "file") return "documento";
    return "otro";
}

/** Qué se guarda en una carpeta al guardar un mensaje entero. */
export function itemCarpetaDeMensaje(m: DmMessage): NuevoItemCarpeta {
    if (!m.body.trim() && m.attachments.length === 1 && !formatoDe(m)) {
        const a = m.attachments[0];
        return { mensajeId: m.id, adjuntoIndice: 0, titulo: a.name || "Adjunto", categoria: categoriaDeAdjunto(a), url: urlVigenteAdjunto(a.url) };
    }
    return { mensajeId: m.id, adjuntoIndice: null, titulo: m.body.trim().slice(0, 80) || "Mensaje", categoria: "mensaje" };
}

const CRISTAL: CSSProperties = {
    background: "rgba(255,255,255,.065)",
    backdropFilter: "blur(16px) saturate(140%)",
    WebkitBackdropFilter: "blur(16px) saturate(140%)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08), inset 0 1px 0 rgba(255,255,255,.06)",
};

/** Tarjeta que sustituye a un medio que ya no existe: nunca un icono roto. */
export function MedioNoDisponible({ nombre, tipo = "imagen" }: { nombre?: string; tipo?: "imagen" | "video" }) {
    const Icono = tipo === "video" ? VideoOff : ImageOff;
    const texto = tipo === "video"
        ? "Este vídeo ya no está disponible en el almacenamiento"
        : "Esta imagen ya no está disponible en el almacenamiento";
    return (
        <div
            role="img"
            aria-label={`${nombre || (tipo === "video" ? "Vídeo" : "Imagen")}: ${texto}`}
            className="flex w-[min(280px,68vw)] items-center gap-3 rounded-2xl px-3.5 py-3"
            style={{ ...CRISTAL, background: "linear-gradient(135deg, rgba(124,92,255,.10), rgba(0,127,255,.06))" }}
        >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-white/60 ring-1 ring-inset ring-white/10">
                <Icono className="h-5 w-5" />
            </span>
            <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium text-white/90">{nombre || (tipo === "video" ? "Vídeo" : "Imagen")}</span>
                <span className="block text-[11.5px] leading-snug text-white/55">{texto}</span>
            </span>
        </div>
    );
}

/** Imagen adjunta con URL vigente, carga diferida opcional y reserva elegante si falla. */
export function ImagenAdjunta({
    attachment, cargar = true, onAbrir,
}: { attachment: DmAttachment; cargar?: boolean; onAbrir?: () => void }) {
    const src = urlVigenteAdjunto(attachment.url);
    const [fallo, setFallo] = useState(false);
    const [forzar, setForzar] = useState(false);
    const nombre = attachment.name || "Imagen";
    if (!src || fallo) return <MedioNoDisponible nombre={attachment.name} />;
    if (!cargar && !forzar) {
        return (
            <button
                type="button"
                onClick={() => setForzar(true)}
                className="flex w-[min(280px,68vw)] cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition-colors duration-200 hover:bg-white/10"
                style={CRISTAL}
            >
                <ImageDown className="h-5 w-5 shrink-0 text-white/70" />
                <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{nombre}</span>
                    <span className="block text-[11.5px] text-white/55">Toca para cargar la imagen</span>
                </span>
            </button>
        );
    }
    const marco = marcoDeAdjunto(attachment);
    if (marco) {
        return (
            <div className="relative aspect-square w-[min(280px,68vw)] overflow-hidden rounded-2xl">
                <FotoConMarco src={src} marco={marco} alt={nombre} size="100%" />
            </div>
        );
    }
    return (
        <button
            type="button"
            onClick={onAbrir}
            aria-label={`Abrir ${nombre}`}
            className="block w-[min(300px,68vw)] cursor-pointer overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10 transition-transform duration-200 hover:scale-[1.01]"
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={src}
                alt={nombre}
                loading="lazy"
                onError={() => setFallo(true)}
                className="block max-h-[360px] w-full object-cover"
            />
        </button>
    );
}

function VideoAdjunto({ attachment, cargar }: { attachment: DmAttachment; cargar: boolean }) {
    const src = urlVigenteAdjunto(attachment.url);
    const [fallo, setFallo] = useState(false);
    const [forzar, setForzar] = useState(false);
    if (!src || fallo) return <MedioNoDisponible nombre={attachment.name} tipo="video" />;
    if (!cargar && !forzar) {
        return (
            <button type="button" onClick={() => setForzar(true)} className="flex w-[min(280px,68vw)] cursor-pointer items-center gap-3 rounded-2xl px-3.5 py-3 text-left hover:bg-white/10" style={CRISTAL}>
                <ImageDown className="h-5 w-5 shrink-0 text-white/70" />
                <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{attachment.name || "Vídeo"}</span>
                    <span className="block text-[11.5px] text-white/55">Toca para cargar el vídeo</span>
                </span>
            </button>
        );
    }
    const marco = marcoDeAdjunto(attachment);
    if (marco) {
        return (
            <div className="flex w-[min(280px,68vw)] justify-center py-1">
                <FotoConMarco src={src} marco={marco} alt={attachment.name || "Vídeo"} size={240} video={true} controles={true} />
            </div>
        );
    }
    return (
        <div className="w-[min(300px,68vw)] overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10">
            <video controls preload="metadata" src={src} onError={() => setFallo(true)} className="block w-full" />
        </div>
    );
}

export function AttachmentView({
    attachment, mio = false, cargarMultimedia = true, onAbrir,
}: { attachment: DmAttachment; mio?: boolean; cargarMultimedia?: boolean; onAbrir?: () => void }) {
    if (attachment.kind === "vivo") return <TarjetaVivo adjunto={attachment} mio={mio} />;
    if (attachment.kind === "llamada") return <TarjetaLlamada adjunto={attachment} mio={mio} />;

    if (isInviteLike(attachment) || isNetworkRefLike(attachment)) {
        return <UniversalAttachmentView attachment={attachment} />;
    }

    if (attachment.kind === "server") {
        return (
            <Link
                href={`/servidores-apps?panel=${encodeURIComponent(attachment.refId ?? "")}`}
                className="flex w-[min(280px,68vw)] cursor-pointer items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/10"
                style={CRISTAL}
            >
                <Server className="h-4 w-4 shrink-0 text-[#7C5CFF]" />
                <span className="truncate text-xs font-semibold">{attachment.name || "Servidor de apps"}</span>
                <ExternalLink className="ml-auto h-3 w-3 shrink-0 text-white/50" />
            </Link>
        );
    }

    if (attachment.kind === "image" && attachment.url) {
        return <ImagenAdjunta attachment={attachment} cargar={cargarMultimedia} onAbrir={onAbrir} />;
    }

    if (attachment.kind === "video" && attachment.url) {
        return <VideoAdjunto attachment={attachment} cargar={cargarMultimedia} />;
    }

    if (attachment.kind === "audio" && attachment.url) {
        const src = urlVigenteAdjunto(attachment.url);
        if (!src) return <MedioNoDisponible nombre={attachment.name || "Audio"} />;
        return (
            <div className="flex w-[min(300px,68vw)] items-center gap-2 rounded-2xl px-3 py-2" style={CRISTAL}>
                <Music className="h-4 w-4 shrink-0 text-white/60" />
                <audio controls preload="none" src={src} className="h-8 w-full" />
            </div>
        );
    }

    // pdf / código / archivo genérico descargable (con URL real): visor rico compartido.
    if (attachment.url) {
        const src = urlVigenteAdjunto(attachment.url);
        if (src) {
            return (
                <div className="w-[min(300px,68vw)]">
                    <FilePreview
                        file={{ url: src, name: attachment.name, mime: attachment.mime, type: attachment.kind }}
                        context="message"
                        compact
                        actions={false}
                    />
                </div>
            );
        }
    }

    // Referencia interna sin archivo real (solo `route`, p.ej. un enlace de app).
    const href = attachment.route;
    const contenido = (
        <div className="flex w-[min(280px,68vw)] items-center gap-2 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/10" style={CRISTAL}>
            <FileIcon className="h-4 w-4 shrink-0 text-white/60" />
            <span className="truncate text-xs font-medium">{attachment.name || "Archivo adjunto"}</span>
        </div>
    );
    if (href) {
        return href.startsWith("/") ? (
            <Link href={href} className="block cursor-pointer">{contenido}</Link>
        ) : (
            <a href={href} target="_blank" rel="noopener noreferrer" className="block cursor-pointer">{contenido}</a>
        );
    }
    return contenido;
}

/** Texto con las coincidencias de búsqueda marcadas. */
function TextoResaltado({ texto, busqueda, activa }: { texto: string; busqueda: string; activa: boolean }) {
    return (
        <p className="whitespace-pre-wrap break-words leading-relaxed" style={{ fontSize: "var(--tam-letra, 14px)" }}>
            {partirResaltado(texto, busqueda).map((t, i) =>
                t.coincide ? (
                    <mark key={i} className={cn(estilos.resaltado, activa && estilos.resaltadoActivo)}>{t.texto}</mark>
                ) : (
                    <span key={i}>{t.texto}</span>
                ),
            )}
        </p>
    );
}

function Cola({ mio, color }: { mio: boolean; color: string }) {
    return (
        <svg
            aria-hidden
            width="10"
            height="13"
            viewBox="0 0 10 13"
            className={cn("pointer-events-none absolute bottom-0", mio ? "left-[calc(100%-1px)]" : "right-[calc(100%-1px)] -scale-x-100")}
        >
            <path d="M0 0 C0 7 3 11 10 13 L0 13 Z" fill={color} />
        </svg>
    );
}

export interface MessageBubbleProps {
    message: DmMessage;
    isMine: boolean;
    sender: OsProfile | null;
    replyToMessage: DmMessage | null;
    isAgentThread: boolean;
    onReply: (message: DmMessage) => void;
    onEdit: (messageId: string, newBody: string) => Promise<void>;
    onDelete: (messageId: string) => Promise<void>;
    /** Nombre ya resuelto del remitente (contacto › perfil). */
    senderName?: string;
    /** Nombre del autor del mensaje citado. */
    replyToName?: string;
    esGrupo?: boolean;
    primeroDelGrupo?: boolean;
    ultimoDelGrupo?: boolean;
    apariencia?: Partial<AjustesApariencia>;
    /** null = no enseñar marcas de lectura. */
    estadoLectura?: EstadoLectura | null;
    vistaPreviaEnlaces?: boolean;
    cargarMultimedia?: boolean;
    busqueda?: string;
    coincidenciaActiva?: boolean;
    destacado?: boolean;
    onAbrirVisor?: (message: DmMessage) => void;
}

export function MessageBubble({
    message, isMine, sender, replyToMessage, isAgentThread, onReply, onEdit, onDelete,
    senderName, replyToName, esGrupo = false, primeroDelGrupo = true, ultimoDelGrupo = true, apariencia,
    estadoLectura = null, vistaPreviaEnlaces = false, cargarMultimedia = true, busqueda = "",
    coincidenciaActiva = false, destacado = false, onAbrirVisor,
}: MessageBubbleProps) {
    const ctx = useContextoHilo();
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(message.body);
    const [menuAbierto, setMenuAbierto] = useState(false);
    const pulsacion = usePulsacionLarga(() => setMenuAbierto(true));
    const isAgent = message.kind === "agent";
    const formato = formatoDe(message);
    const compacta = apariencia?.densidad === "compacta";
    const mostrarHora = apariencia?.mostrarHora !== false;
    const formato24h = apariencia?.formato24h !== false;
    const color = apariencia?.colorBurbuja || "#7C5CFF";
    const claro = isMine && esColorClaro(color);

    if (message.kind === "system") {
        return (
            <div id={`msg-${message.id}`} className="flex justify-center py-1.5">
                <span className="rounded-full px-3 py-1 text-[11.5px] text-white/65" style={CRISTAL}>{message.body}</span>
            </div>
        );
    }

    const separacion = primeroDelGrupo ? (compacta ? "mt-2" : "mt-3.5") : compacta ? "mt-0.5" : "mt-[3px]";

    if (message.deleted) {
        return (
            <div id={`msg-${message.id}`} className={cn("flex", separacion, isMine ? "justify-end" : "justify-start", !isMine && esGrupo && "pl-9")}>
                <div className="flex items-center gap-1.5 rounded-2xl px-3.5 py-2 text-xs italic text-white/50" style={{ ...CRISTAL, background: "transparent", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.1)" }}>
                    <Ban className="h-3.5 w-3.5" /> Mensaje eliminado
                </div>
            </div>
        );
    }

    const displayName = isAgent ? "Aurora" : senderName || sender?.displayName || "Miembro";
    const abrirVisor = () => (onAbrirVisor ? onAbrirVisor(message) : ctx?.abrirVisor(message.id));

    const handleSaveEdit = async () => {
        const text = draft.trim();
        if (!text || text === message.body) {
            setEditing(false);
            return;
        }
        await onEdit(message.id, text);
        setEditing(false);
    };

    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(message.body || message.attachments.map((a) => a.name || a.url || "").join("\n"));
            toast.success("Copiado");
        } catch {
            toast.error("No se pudo copiar en este navegador.");
        }
    };

    const esquinas = (() => {
        const grande = "18px";
        const chica = "6px";
        const arriba = primeroDelGrupo ? grande : chica;
        const abajo = ultimoDelGrupo ? "4px" : chica;
        return isMine
            ? { borderTopLeftRadius: grande, borderBottomLeftRadius: grande, borderTopRightRadius: arriba, borderBottomRightRadius: abajo }
            : { borderTopRightRadius: grande, borderBottomRightRadius: grande, borderTopLeftRadius: arriba, borderBottomLeftRadius: abajo };
    })();

    const finalDegradado = sombrear(color, 0.28);
    // Con fondo, marco o lienzo, MensajeFormateado dibuja su propia superficie.
    const sinCromo = !!formato && (!!formato.lienzo || !!formato.estilo?.fondo || !!formato.estilo?.colorMarco || !!formato.estilo?.grosorMarco);
    const fondoBurbuja: CSSProperties = sinCromo
        ? {}
        : isMine
            ? {
                background: `linear-gradient(135deg, ${sombrear(color, -0.1)} 0%, ${color} 48%, ${finalDegradado} 100%)`,
                boxShadow: `0 6px 18px ${color}33, inset 0 1px 0 rgba(255,255,255,.18)`,
                color: claro ? "#0b0b12" : "#fff",
            }
            : isAgent
                ? { ...CRISTAL, background: "linear-gradient(135deg, rgba(0,127,255,.16), rgba(0,127,255,.06))", boxShadow: "inset 0 0 0 1px rgba(0,127,255,.28), inset 0 1px 0 rgba(255,255,255,.06)" }
                : CRISTAL;
    const colorCola = isMine ? finalDegradado : isAgent ? "rgba(0,127,255,.12)" : "rgba(255,255,255,.065)";

    const coincide = !!busqueda.trim() && plegar(textoBuscable(message)).includes(plegar(busqueda.trim()));
    const tintaSecundaria = isMine ? (claro ? "text-black/55" : "text-white/70") : "text-white/50";

    const cuerpo = editing ? (
        <div className="flex min-w-[200px] items-center gap-1.5">
            <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSaveEdit();
                    }
                    if (e.key === "Escape") setEditing(false);
                }}
                autoFocus
                rows={Math.min(6, Math.max(1, draft.split("\n").length))}
                aria-label="Editar mensaje"
                className="min-w-0 flex-1 resize-none rounded-lg border border-white/20 bg-black/20 px-2 py-1 text-sm outline-none focus:border-white/40"
            />
            <Button size="icon" aria-label="Guardar cambios" className="ss-redondo h-7 w-7 shrink-0 cursor-pointer" onClick={() => void handleSaveEdit()}>
                <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" aria-label="Cancelar edición" className="ss-redondo h-7 w-7 shrink-0 cursor-pointer" onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5" />
            </Button>
        </div>
    ) : (
        <>
            {formato ? (
                <MensajeFormateado formato={formato} textoPlano={message.body} mio={isMine} onAbrir={abrirVisor} />
            ) : message.body.trim() ? (
                coincide ? (
                    <TextoResaltado texto={message.body} busqueda={busqueda} activa={coincidenciaActiva} />
                ) : (
                    <MessageRenderer
                        text={message.body}
                        media={vistaPreviaEnlaces}
                        compact
                        className={cn(estilos.cuerpo, isMine && (claro ? estilos.textoOscuro : estilos.textoClaro))}
                    />
                )
            ) : null}
            {message.attachments.length > 0 && (
                <div className={cn("space-y-1.5", (message.body.trim() || formato) && "mt-1.5")}>
                    {message.attachments.map((a, i) => (
                        <AttachmentView key={i} attachment={a} mio={isMine} cargarMultimedia={cargarMultimedia} onAbrir={abrirVisor} />
                    ))}
                </div>
            )}
        </>
    );

    const pie = (
        <span className={cn("ml-auto flex shrink-0 items-center justify-end gap-1 pl-2 text-[10.5px] leading-none", tintaSecundaria)}>
            {message.editedAt && <span className="italic">editado</span>}
            {mostrarHora && <time dateTime={message.createdAt}>{formatearHora(message.createdAt, formato24h)}</time>}
            {isMine && estadoLectura && (
                estadoLectura === "enviado" ? (
                    <Check className="h-3.5 w-3.5" aria-label="Enviado" />
                ) : (
                    <CheckCheck
                        className="h-3.5 w-3.5"
                        aria-label={estadoLectura === "leido" ? "Leído" : "Leído por algunos"}
                        style={estadoLectura === "leido" ? { color: claro ? "#0050B3" : "#9EE7FF" } : undefined}
                    />
                )
            )}
        </span>
    );

    const acciones = !editing && (
        <div
            className={cn(
                "flex shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity duration-200 focus-within:opacity-100 group-hover/burbuja:opacity-100",
                menuAbierto && "opacity-100",
                isMine ? "order-first" : "",
            )}
        >
            <button
                type="button"
                onClick={() => onReply(message)}
                aria-label="Responder"
                className="ss-redondo hidden h-7 w-7 cursor-pointer place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white md:grid"
            >
                <Reply className="h-3.5 w-3.5" />
            </button>
            <DropdownMenu open={menuAbierto} onOpenChange={setMenuAbierto}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label="Acciones del mensaje"
                        className="ss-redondo grid h-7 w-7 cursor-pointer place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isMine ? "end" : "start"} className="min-w-[230px]" collisionPadding={12}>
                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => onReply(message)}>
                        <Reply className="h-4 w-4" /> Responder
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => void copiar()}>
                        <Copy className="h-4 w-4" /> Copiar
                    </DropdownMenuItem>
                    <DropdownMenuItem className="cursor-pointer gap-2" onSelect={abrirVisor}>
                        <Maximize2 className="h-4 w-4" /> Ver a pantalla completa
                    </DropdownMenuItem>
                    {ctx && <SubmenuGuardarEnCarpeta item={itemCarpetaDeMensaje(message)} />}
                    <DropdownMenuItem asChild onSelect={(e) => e.preventDefault()}>
                        <div className="px-0 py-0">
                            <SaveToLibrary
                                variant="menu-item"
                                label="Guardar en Biblioteca"
                                item={{
                                    type: TIPO_MENSAJE_BIBLIOTECA,
                                    refId: message.id,
                                    title: message.body.slice(0, 60) || message.attachments[0]?.name || "Mensaje guardado",
                                    note: `De ${displayName}`,
                                    url: message.attachments.length === 1 ? urlVigenteAdjunto(message.attachments[0].url) : undefined,
                                }}
                            />
                        </div>
                    </DropdownMenuItem>
                    {isMine && (
                        <>
                            <DropdownMenuSeparator />
                            {!isAgentThread && !formato && (
                                <DropdownMenuItem className="cursor-pointer gap-2" onSelect={() => { setDraft(message.body); setEditing(true); }}>
                                    <Pencil className="h-4 w-4" /> Editar
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuItem className="cursor-pointer gap-2 text-red-400 focus:text-red-400" onSelect={() => void onDelete(message.id)}>
                                <Trash2 className="h-4 w-4" /> Eliminar
                            </DropdownMenuItem>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );

    let citado: ReactNode = null;
    if (replyToMessage) {
        citado = (
            <button
                type="button"
                onClick={() => ctx?.irAlMensaje(replyToMessage.id)}
                className={cn(
                    "mb-1.5 block w-full cursor-pointer rounded-xl border-l-[3px] px-2.5 py-1.5 text-left transition-colors",
                    isMine ? (claro ? "border-black/40 bg-black/10 hover:bg-black/15" : "border-white/70 bg-white/15 hover:bg-white/20") : "border-[#7C5CFF] bg-white/[0.06] hover:bg-white/10",
                )}
            >
                <span className={cn("block text-[11px] font-semibold", isMine ? "" : "text-[#b7a6ff]")}>{replyToName || "Mensaje"}</span>
                <span className={cn("block truncate text-[12px]", isMine ? (claro ? "text-black/70" : "text-white/80") : "text-white/65")}>
                    {replyToMessage.deleted ? "Mensaje eliminado" : replyToMessage.body.slice(0, 90) || (replyToMessage.attachments[0]?.name ?? "Adjunto")}
                </span>
            </button>
        );
    }

    return (
        <div
            id={`msg-${message.id}`}
            data-mensaje-id={message.id}
            className={cn("group/burbuja flex items-end gap-2", separacion, isMine ? "justify-end" : "justify-start")}
        >
            {!isMine && esGrupo && (
                <div className="w-7 shrink-0 self-end">
                    {ultimoDelGrupo && (
                        <Avatar className="h-7 w-7">
                            {isAgent ? (
                                <AvatarFallback className="bg-[#007FFF]/20 text-[#7fb8ff]"><Bot className="h-3.5 w-3.5" /></AvatarFallback>
                            ) : (
                                <>
                                    <AvatarImage src={urlVigenteAdjunto(sender?.avatarUrl)} alt="" />
                                    <AvatarFallback className="text-[10px]">{displayName.replace(/^@/, "").slice(0, 2).toUpperCase()}</AvatarFallback>
                                </>
                            )}
                        </Avatar>
                    )}
                </div>
            )}
            {!isMine && !esGrupo && isAgent && (
                <Avatar className="h-7 w-7 shrink-0 self-end">
                    <AvatarFallback className="bg-[#007FFF]/20 text-[#7fb8ff]"><Bot className="h-3.5 w-3.5" /></AvatarFallback>
                </Avatar>
            )}

            <div className={cn("flex min-w-0 max-w-[min(520px,82%)] flex-col", isMine ? "items-end" : "items-start")}>
                {primeroDelGrupo && ((!isMine && esGrupo) || isAgent) && (
                    <p className={cn("mb-0.5 px-1 text-[11.5px] font-semibold", isAgent ? "text-[#7fb8ff]" : "text-[#b7a6ff]")}>{displayName}</p>
                )}
                <div
                    {...pulsacion}
                    onContextMenu={(e) => {
                        if (editing) return;
                        e.preventDefault();
                        setMenuAbierto(true);
                    }}
                    className={cn(
                        "relative min-w-0 max-w-full select-text transition-shadow duration-200",
                        !sinCromo && (compacta ? "px-3 py-1.5" : "px-3.5 py-2"),
                        destacado && estilos.destello,
                        coincide && !coincidenciaActiva && "ring-1 ring-[#FFBF00]/40",
                        coincidenciaActiva && "ring-2 ring-[#FFBF00]/80",
                    )}
                    style={{ ...fondoBurbuja, ...esquinas }}
                >
                    {citado}
                    <div className="flex flex-wrap items-end gap-x-1">
                        <div className="min-w-0 max-w-full flex-[1_1_auto]">{cuerpo}</div>
                        {!editing && pie}
                    </div>
                    {ultimoDelGrupo && !sinCromo && <Cola mio={isMine} color={colorCola} />}
                </div>
            </div>

            {acciones}
        </div>
    );
}

export default MessageBubble;
