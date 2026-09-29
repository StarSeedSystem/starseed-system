"use client";
/**
 * Piezas de publicación del paquete D (Ola 0929): la fila compacta, la tarjeta con miniatura, la
 * portada (héroe) y la barra de acciones (resonar, comentar, guardar, abrir). Las comparten el
 * Feed de la Red, Publicaciones relevantes y la Corriente cultural: la misma voz en los tres.
 * Las acciones que se pintan son las REALES que el widget pase; sin callback, no hay botón.
 */
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Bookmark, BookmarkCheck, FileText, Heart, Image as ImageIcon, Link2, MessageSquare, Play, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { conAlfa } from "@/components/widgets-libres/acentos-categoria";
import { Avatar, BotonIcono, Miniatura, Tiempo, estilosSocial as estilos, tintaDe } from "./piezas";
import { formatoNumero } from "./formato";

export interface PublicacionVista {
    id: string;
    autor: string;
    avatar: string | null;
    titulo?: string | null;
    texto: string;
    media: string | null;
    tipoMedia: "imagen" | "video" | "enlace" | "archivo" | null;
    nMedia: number;
    reacciones: number;
    meGusta?: boolean;
    comentarios: number;
    /** Tipo, rama o área que la clasifica (se pinta como rótulo). */
    etiqueta?: string | null;
    colorEtiqueta?: string;
    ms: number;
    href: string;
    hrefAutor?: string | null;
    /** No hay página de conversación para esta publicación: el recuento no es un enlace. */
    sinConversacion?: boolean;
}

export interface AccionesPublicacion {
    /** Abre la publicación DENTRO del widget (lector) en vez de navegar a `href`. */
    onAbrir?: (p: PublicacionVista) => void;
    onResonar?: (p: PublicacionVista) => void;
    onGuardar?: (p: PublicacionVista) => void;
    guardadas?: Set<string>;
    /** Etiqueta del botón de guardar (p. ej. «Guardar en tu biblioteca» o «Guardar aquí»). */
    etiquetaGuardar?: string;
}

export function iconoMedia(tipo: PublicacionVista["tipoMedia"]): LucideIcon {
    return tipo === "video" ? Play : tipo === "enlace" ? Link2 : tipo === "archivo" ? FileText : ImageIcon;
}

/** Texto principal de una publicación (título + cuerpo, sin repetirse). */
export function textoDe(p: Pick<PublicacionVista, "titulo" | "texto" | "tipoMedia">): string {
    const t = (p.titulo ?? "").trim();
    const b = (p.texto ?? "").trim();
    if (t && b && !b.startsWith(t)) return `${t} — ${b}`;
    return b || t || (p.tipoMedia ? "Publicación multimedia" : "Publicación sin texto");
}

/** Enlace a la publicación, o botón que abre el lector del widget si se pasa `onAbrir`. */
export function Abrir({ p, onAbrir, className, children, etiqueta, oculto = false, style }: {
    p: PublicacionVista;
    onAbrir?: (p: PublicacionVista) => void;
    className?: string;
    children: React.ReactNode;
    etiqueta?: string;
    oculto?: boolean;
    style?: React.CSSProperties;
}) {
    if (onAbrir) {
        return (
            <button type="button" onClick={() => onAbrir(p)} className={cn("cursor-pointer text-left", className)} style={style}
                aria-label={oculto ? undefined : etiqueta} aria-hidden={oculto || undefined} tabIndex={oculto ? -1 : undefined}>
                {children}
            </button>
        );
    }
    return (
        <Link href={p.href} className={cn("cursor-pointer", className)} style={style} aria-label={oculto ? undefined : etiqueta} aria-hidden={oculto || undefined} tabIndex={oculto ? -1 : undefined}>
            {children}
        </Link>
    );
}

// ── Acciones ─────────────────────────────────────────────────────────

export function BarraAcciones({ p, acento, acciones, tactil, compacta = false }: { p: PublicacionVista; acento: string; acciones: AccionesPublicacion; tactil: boolean; compacta?: boolean }) {
    const guardada = acciones.guardadas?.has(p.id) ?? false;
    const alto = tactil ? "min-h-11 min-w-11" : "min-h-7";
    const base = cn("inline-flex cursor-pointer items-center gap-1 rounded-full ss-redondo px-2 text-[11.5px] font-semibold tabular-nums transition-colors duration-200", alto);
    return (
        <div className="flex items-center gap-1 text-white/65">
            {acciones.onResonar ? (
                <button type="button" onClick={() => acciones.onResonar?.(p)} aria-pressed={!!p.meGusta}
                    aria-label={p.meGusta ? `Quitar resonancia (${p.reacciones})` : `Resonar con esta publicación (${p.reacciones})`}
                    title={p.meGusta ? "Quitar resonancia" : "Resonar"}
                    className={cn(base, p.meGusta ? "text-rose-300" : "hover:text-rose-300")}
                    style={p.meGusta ? { background: "rgba(244,63,94,.14)" } : undefined}>
                    <Heart className={cn("size-3.5", p.meGusta && "fill-current")} aria-hidden />{formatoNumero(p.reacciones)}
                </button>
            ) : (
                <span className={cn(base, "cursor-default")} aria-label={`${p.reacciones} reacciones`}><Heart className="size-3.5" aria-hidden />{formatoNumero(p.reacciones)}</span>
            )}
            {p.sinConversacion && !acciones.onAbrir ? (
                <span className={cn(base, "cursor-default")} aria-label={`${p.comentarios} comentarios`}><MessageSquare className="size-3.5" aria-hidden />{formatoNumero(p.comentarios)}</span>
            ) : (
                <Abrir p={p} onAbrir={acciones.onAbrir} className={cn(base, "hover:text-white")} etiqueta={`${p.comentarios} comentarios: abrir la conversación`}>
                    <MessageSquare className="size-3.5" aria-hidden />{formatoNumero(p.comentarios)}
                </Abrir>
            )}
            {acciones.onGuardar && (
                <button type="button" onClick={() => acciones.onGuardar?.(p)} disabled={guardada} aria-pressed={guardada}
                    aria-label={guardada ? "Guardada" : acciones.etiquetaGuardar ?? "Guardar"} title={guardada ? "Guardada" : acciones.etiquetaGuardar ?? "Guardar"}
                    className={cn(base, guardada ? "cursor-default" : "hover:text-white")} style={guardada ? { color: tintaDe(acento) } : undefined}>
                    {guardada ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
                    {!compacta && <span className="font-medium">{guardada ? "Guardada" : "Guardar"}</span>}
                </button>
            )}
        </div>
    );
}

// ── Fila compacta ────────────────────────────────────────────────────

export function FilaPublicacion({ p, acento, tactil, miniatura = true, lineas = 2, onAbrir, antes }: { p: PublicacionVista; acento: string; tactil: boolean; miniatura?: boolean; lineas?: 1 | 2 | 3; onAbrir?: (p: PublicacionVista) => void; antes?: React.ReactNode }) {
    const Icono = iconoMedia(p.tipoMedia);
    return (
        <Abrir p={p} onAbrir={onAbrir} className={cn(estilos.fila, "flex w-full min-w-0 items-start gap-2.5 px-2", tactil ? "py-2.5" : "py-2")} etiqueta={`${p.autor}: ${textoDe(p)}`}>
            {antes}
            <Avatar nombre={p.autor} url={p.avatar} tam={tactil ? 36 : 30} />
            <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-semibold text-white">{p.autor}</span>
                    {p.etiqueta && <span className="truncate text-[10.5px] font-semibold uppercase tracking-[0.1em]" style={{ color: tintaDe(p.colorEtiqueta ?? acento) }}>{p.etiqueta}</span>}
                    <Tiempo ms={p.ms} corto className="ml-auto text-[10.5px]" />
                </span>
                <span className={cn("mt-0.5 block text-[12.5px] leading-snug text-white/80", lineas === 1 ? "line-clamp-1" : lineas === 3 ? "line-clamp-3" : "line-clamp-2")}>{textoDe(p)}</span>
                <span className="mt-1 flex items-center gap-3 text-[10.5px] font-semibold tabular-nums text-white/50">
                    <span className={cn("inline-flex items-center gap-1", p.meGusta && "text-rose-300")}><Heart className={cn("size-3", p.meGusta && "fill-current")} aria-hidden />{formatoNumero(p.reacciones)}</span>
                    <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" aria-hidden />{formatoNumero(p.comentarios)}</span>
                    {p.nMedia > 1 && <span className="inline-flex items-center gap-1"><Icono className="size-3" aria-hidden />{p.nMedia}</span>}
                </span>
            </span>
            {miniatura && p.tipoMedia && (
                <Miniatura url={p.media} icono={Icono} acento={acento} semilla={p.id} className={tactil ? "size-14" : "size-12"} redondeo={12} alt="" />
            )}
        </Abrir>
    );
}

// ── Tarjeta con miniatura arriba ─────────────────────────────────────

export function TarjetaPublicacion({ p, acento, tactil, acciones, altoMedia = 110 }: { p: PublicacionVista; acento: string; tactil: boolean; acciones: AccionesPublicacion; altoMedia?: number }) {
    const Icono = iconoMedia(p.tipoMedia);
    return (
        <article className={cn(estilos.tarjeta, "flex h-full min-w-0 flex-col gap-2 rounded-[18px] p-2")}
            style={{ background: `linear-gradient(170deg, ${conAlfa(p.colorEtiqueta ?? acento, 0.12)}, rgba(255,255,255,.02) 55%)` }}
            aria-label={`${p.autor}: ${textoDe(p)}`}>
            <Abrir p={p} onAbrir={acciones.onAbrir} className="block shrink-0" oculto style={{ height: altoMedia }}>
                <Miniatura url={p.media} icono={p.tipoMedia ? Icono : MessageSquare} acento={p.colorEtiqueta ?? acento} semilla={p.id} className="size-full" redondeo={14} />
            </Abrir>
            <div className="flex min-w-0 items-center gap-1.5 px-0.5">
                <Avatar nombre={p.autor} url={p.avatar} tam={22} />
                <span className="truncate text-[11.5px] font-semibold text-white">{p.autor}</span>
                <Tiempo ms={p.ms} corto className="ml-auto text-[10.5px]" />
            </div>
            <Abrir p={p} onAbrir={acciones.onAbrir} className="line-clamp-3 min-h-0 px-0.5 text-[12.5px] leading-snug text-white/85 hover:text-white">{textoDe(p)}</Abrir>
            <div className="mt-auto px-0.5"><BarraAcciones p={p} acento={acento} acciones={acciones} tactil={tactil} compacta /></div>
        </article>
    );
}

// ── Portada (héroe) ──────────────────────────────────────────────────

export function PortadaPublicacion({ p, acento, tactil, acciones }: { p: PublicacionVista; acento: string; tactil: boolean; acciones: AccionesPublicacion }) {
    const Icono = iconoMedia(p.tipoMedia);
    return (
        <article className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px]" aria-label={`Destacada. ${p.autor}: ${textoDe(p)}`}>
            <Abrir p={p} onAbrir={acciones.onAbrir} className="absolute inset-0 block" oculto>
                <Miniatura url={p.media} icono={p.tipoMedia ? Icono : MessageSquare} acento={p.colorEtiqueta ?? acento} semilla={p.id} className="size-full" redondeo={20} />
            </Abrir>
            <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[20px]" style={{ background: "linear-gradient(180deg, rgba(8,9,24,0) 30%, rgba(8,9,24,.55) 62%, rgba(8,9,24,.92) 100%)" }} />
            <div className="relative mt-auto flex flex-col gap-2 p-3">
                <div className="flex items-center gap-2">
                    <Avatar nombre={p.autor} url={p.avatar} tam={28} anillo acento={acento} />
                    <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold text-white">{p.autor}</span>
                        <span className="flex items-center gap-1.5 text-[10.5px] text-white/60">
                            {p.etiqueta && <span className="font-semibold uppercase tracking-[0.1em]" style={{ color: tintaDe(p.colorEtiqueta ?? acento) }}>{p.etiqueta}</span>}
                            <Tiempo ms={p.ms} />
                        </span>
                    </span>
                </div>
                <Abrir p={p} onAbrir={acciones.onAbrir} className="line-clamp-3 text-[15px] font-medium leading-snug text-white hover:underline" style={{ textShadow: "0 1px 8px rgba(0,0,0,.6)" }}>{textoDe(p)}</Abrir>
                <BarraAcciones p={p} acento={acento} acciones={acciones} tactil={tactil} />
            </div>
        </article>
    );
}

// ── Lector dentro del widget ─────────────────────────────────────────

/** Lectura completa de una publicación sin salir del tablero (Escape o «Volver» la cierra). */
export function LectorPublicacion({ p, acento, tactil, onCerrar, acciones, pie }: {
    p: PublicacionVista;
    acento: string;
    tactil: boolean;
    onCerrar: () => void;
    acciones: AccionesPublicacion;
    pie?: React.ReactNode;
}) {
    const ref = React.useRef<HTMLElement | null>(null);
    React.useEffect(() => { ref.current?.focus(); }, [p.id]);
    const Icono = iconoMedia(p.tipoMedia);
    const sinAbrir: AccionesPublicacion = { ...acciones, onAbrir: undefined };
    return (
        <article ref={ref} tabIndex={-1} onKeyDown={(e) => { if (e.key === "Escape") onCerrar(); }}
            className={cn(estilos.aparece, "flex h-full min-h-0 flex-col gap-2 outline-none")} aria-label={`Leyendo la publicación de ${p.autor}`}>
            <header className="flex items-center gap-2">
                <BotonIcono icono={ArrowLeft} etiqueta="Volver a la lista" onClick={onCerrar} acento={acento} tactil={tactil} />
                <Avatar nombre={p.autor} url={p.avatar} tam={28} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold text-white">{p.autor}</span>
                    <span className="flex items-center gap-1.5 text-[10.5px] text-white/55">
                        {p.etiqueta && <span className="font-semibold uppercase tracking-[0.1em]" style={{ color: tintaDe(p.colorEtiqueta ?? acento) }}>{p.etiqueta}</span>}
                        <Tiempo ms={p.ms} />
                    </span>
                </span>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 ss-scroll">
                {p.tipoMedia && p.media && (
                    <Miniatura url={p.media} icono={Icono} acento={p.colorEtiqueta ?? acento} semilla={p.id} className="mb-2 aspect-[16/9] max-h-56 w-full" redondeo={14} alt={p.titulo ?? ""} />
                )}
                {p.titulo && <h4 className="mb-1 text-[15px] font-semibold leading-snug text-white">{p.titulo}</h4>}
                <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-white/85">{p.texto || textoDe(p)}</p>
            </div>
            <footer className="flex flex-wrap items-center justify-between gap-2">
                <BarraAcciones p={p} acento={acento} acciones={sinAbrir} tactil={tactil} />
                {pie}
            </footer>
        </article>
    );
}
