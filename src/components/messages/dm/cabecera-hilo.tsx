"use client";

/**
 * Cabecera del chat (2026-09-28): nombre REAL de la persona o del grupo, avatar con su punto de
 * presencia, «escribiendo…» o la última vez en línea, llamadas, modo enfoque, búsqueda dentro
 * del chat y el menú ⋮ vertical con todo lo demás. Tocar el nombre abre la información.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
    Archive, ArchiveRestore, ArrowLeft, Bell, BellOff, Bot, ChevronDown, ChevronUp, Download, Eraser, ExternalLink,
    Folder, Info, Maximize2, Minimize2, MoreVertical, Paintbrush, Search, Settings2, Paperclip, UserPlus, X,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub,
    DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PopoverContent } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { BotonesLlamada } from "@/components/llamadas/botones-llamada";
import { OPCIONES_SILENCIO } from "@/lib/mensajeria/ajustes";
import { AvatarHilo } from "@/components/messages/dm/avatar-hilo";
import type { VistaInfo } from "@/components/messages/dm/contexto-hilo";
import estilos from "@/components/messages/dm/hilo.module.css";

const BOTON_ICONO =
    "ss-redondo grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]";

export interface CabeceraHiloProps {
    hiloId: string;
    nombre: string;
    avatarUrl?: string | null;
    esGrupo: boolean;
    /** Ids de todos los miembros (para las llamadas). */
    miembros: string[];
    enLinea: boolean;
    /** Texto bajo el nombre (presencia, miembros…). */
    subtitulo: string | null;
    /** Si alguien escribe, sustituye al subtítulo. */
    escribiendo: string | null;
    auroraActiva: boolean;
    esMovil: boolean;
    onAtras?: () => void;
    onAbrirInfo: (vista?: VistaInfo, foco?: string) => void;
    enfocado?: boolean;
    onAlternarEnfoque?: () => void;
    busquedaAbierta: boolean;
    onAlternarBusqueda: () => void;
    silenciado: boolean;
    onSilenciar: (hasta: string | null) => void;
    archivado: boolean;
    onArchivar: () => void;
    /** Solo en chats de dos cuando la persona aún no es contacto. */
    onAnadirContacto?: () => void;
    onExportar: () => void;
    onVaciar: () => void;
    onAlternarAurora: (activa: boolean) => void;
    /** Página de la comunidad/grupo de la red vinculada, si existe. */
    enlaceEntidad?: string | null;
}

export function CabeceraHilo(p: CabeceraHiloProps) {
    const [auroraAbierta, setAuroraAbierta] = useState(false);
    const abrirAuroraAlCerrar = useRef(false);
    const cabeceraRef = useRef<HTMLElement>(null);
    const [estrecha, setEstrecha] = useState(false);
    // Llamadas en un solo botón cuando la cabecera es estrecha (móvil o lista + chat en 768 px).
    useEffect(() => {
        const el = cabeceraRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const obs = new ResizeObserver(([e]) => setEstrecha((e?.contentRect.width ?? 999) < 600));
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const elemento = (icono: ReactNode, texto: string, accion: () => void, extra?: string) => (
        <DropdownMenuItem className={cn("cursor-pointer gap-2.5 py-2", extra)} onSelect={accion}>
            {icono}
            <span>{texto}</span>
        </DropdownMenuItem>
    );

    return (
        <header
            ref={cabeceraRef}
            className="relative z-20 flex shrink-0 items-center gap-1.5 border-b border-white/[0.08] px-2 py-2 sm:gap-2 sm:px-3"
            style={{
                background: "rgba(12,14,34,.55)",
                backdropFilter: "blur(20px) saturate(140%)",
                WebkitBackdropFilter: "blur(20px) saturate(140%)",
                boxShadow: "inset 0 -1px 0 rgba(255,255,255,.04)",
            }}
        >
            {p.onAtras && (
                <button type="button" onClick={p.onAtras} aria-label="Volver a la lista de chats" className={BOTON_ICONO}>
                    <ArrowLeft className="h-5 w-5" />
                </button>
            )}

            <button
                type="button"
                onClick={() => p.onAbrirInfo("inicio")}
                aria-label={`Ver información de ${p.nombre}`}
                title={p.nombre}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl px-1.5 py-1 text-left transition-colors duration-200 hover:bg-white/[0.05]"
            >
                <AvatarHilo nombre={p.nombre} url={p.avatarUrl} esGrupo={p.esGrupo} enLinea={p.enLinea} tam={40} />
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold leading-tight text-white" data-testid="nombre-hilo">
                        {p.nombre}
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[12.5px] leading-tight">
                        {p.escribiendo ? (
                            <span className="flex min-w-0 items-center gap-1.5 text-[#6EE7B7]">
                                <span className={estilos.puntos} aria-hidden><span /><span /><span /></span>
                                <span className="truncate">{p.escribiendo}</span>
                            </span>
                        ) : (
                            <span className="truncate text-white/60">{p.subtitulo || (p.esGrupo ? "Grupo" : "Chat directo")}</span>
                        )}
                        {p.auroraActiva && (
                            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#7fb8ff]">
                                <Bot className="h-3 w-3" /> Aurora
                            </span>
                        )}
                        {p.silenciado && <BellOff className="h-3 w-3 shrink-0 text-white/40" aria-label="Silenciado" />}
                    </span>
                </span>
            </button>

            <div className="flex shrink-0 items-center gap-0.5">
                <BotonesLlamada hiloId={p.hiloId} miembros={p.miembros} titulo={p.nombre} compacto={p.esMovil || estrecha} />

                {p.onAlternarEnfoque && (
                    <button
                        type="button"
                        onClick={p.onAlternarEnfoque}
                        aria-label={p.enfocado ? "Salir del modo enfoque" : "Modo enfoque"}
                        aria-pressed={!!p.enfocado}
                        title={p.enfocado ? "Salir del modo enfoque" : "Modo enfoque"}
                        className={cn(BOTON_ICONO, "hidden md:grid")}
                    >
                        {p.enfocado ? <Minimize2 className="h-[18px] w-[18px]" /> : <Maximize2 className="h-[18px] w-[18px]" />}
                    </button>
                )}

                <button
                    type="button"
                    onClick={p.onAlternarBusqueda}
                    aria-label="Buscar en este chat"
                    aria-pressed={p.busquedaAbierta}
                    title="Buscar en este chat"
                    className={cn(BOTON_ICONO, "hidden sm:grid", p.busquedaAbierta && "bg-white/10 text-white")}
                >
                    <Search className="h-[18px] w-[18px]" />
                </button>

                <PopoverPrimitive.Root open={auroraAbierta} onOpenChange={setAuroraAbierta}>
                    <DropdownMenu>
                        <PopoverPrimitive.Anchor asChild>
                            <DropdownMenuTrigger asChild>
                                <button type="button" aria-label="Más opciones del chat" className={BOTON_ICONO}>
                                    <MoreVertical className="h-5 w-5" />
                                </button>
                            </DropdownMenuTrigger>
                        </PopoverPrimitive.Anchor>
                        <DropdownMenuContent
                            align="end"
                            collisionPadding={12}
                            className="min-w-[250px] max-w-[calc(100vw-24px)]"
                            onCloseAutoFocus={(e) => {
                                if (abrirAuroraAlCerrar.current) {
                                    e.preventDefault();
                                    abrirAuroraAlCerrar.current = false;
                                    setAuroraAbierta(true);
                                }
                            }}
                        >
                            {elemento(<Info className="h-4 w-4" />, p.esGrupo ? "Info del grupo" : "Info del contacto", () => p.onAbrirInfo("inicio"))}
                            {elemento(<Paperclip className="h-4 w-4" />, "Archivos, enlaces y documentos", () => p.onAbrirInfo("archivos"))}
                            {elemento(<Folder className="h-4 w-4" />, "Carpetas del chat", () => p.onAbrirInfo("carpetas"))}
                            {elemento(<Search className="h-4 w-4" />, "Buscar", p.onAlternarBusqueda)}
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="cursor-pointer gap-2.5 py-2">
                                    {p.silenciado ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                                    <span>{p.silenciado ? "Silenciado" : "Silenciar"}</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="z-[140] min-w-[210px]" collisionPadding={12}>
                                    {OPCIONES_SILENCIO.map((o) => (
                                        <DropdownMenuItem key={o.id} className="cursor-pointer py-2" onSelect={() => p.onSilenciar(o.hasta(new Date()))}>
                                            {o.etiqueta}
                                        </DropdownMenuItem>
                                    ))}
                                    {p.silenciado && (
                                        <>
                                            <DropdownMenuSeparator />
                                            <DropdownMenuItem className="cursor-pointer gap-2 py-2" onSelect={() => p.onSilenciar(null)}>
                                                <Bell className="h-4 w-4" /> Quitar silencio
                                            </DropdownMenuItem>
                                        </>
                                    )}
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            {elemento(<Paintbrush className="h-4 w-4" />, "Fondo y apariencia", () => p.onAbrirInfo("ajustes", "apariencia"))}
                            {elemento(<Settings2 className="h-4 w-4" />, "Ajustes de este chat", () => p.onAbrirInfo("ajustes"))}
                            {p.onAnadirContacto && elemento(<UserPlus className="h-4 w-4 text-[#14B8A6]" />, "Añadir a contactos", p.onAnadirContacto)}
                            {p.enlaceEntidad && (
                                <DropdownMenuItem asChild className="cursor-pointer gap-2.5 py-2">
                                    <Link href={p.enlaceEntidad}>
                                        <ExternalLink className="h-4 w-4" /> <span>Abrir la comunidad vinculada</span>
                                    </Link>
                                </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {elemento(<Download className="h-4 w-4" />, "Exportar chat", p.onExportar)}
                            {elemento(<Eraser className="h-4 w-4" />, "Vaciar chat (solo para mí)", p.onVaciar)}
                            {elemento(
                                p.archivado ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />,
                                p.archivado ? "Desarchivar" : "Archivar",
                                p.onArchivar,
                            )}
                            <DropdownMenuSeparator />
                            {elemento(<Bot className="h-4 w-4 text-[#7fb8ff]" />, "Aurora en este chat", () => { abrirAuroraAlCerrar.current = true; })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <PopoverContent align="end" className="w-72 rounded-2xl border-white/10 bg-[rgba(12,14,34,.92)] backdrop-blur-xl">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <Label htmlFor={`aurora-${p.hiloId}`} className="flex items-center gap-1.5 text-sm font-semibold">
                                    <Bot className="h-3.5 w-3.5 text-[#007FFF]" /> Aurora en este chat
                                </Label>
                                <Switch
                                    id={`aurora-${p.hiloId}`}
                                    className="ss-redondo"
                                    checked={p.auroraActiva}
                                    onCheckedChange={(v) => p.onAlternarAurora(v)}
                                />
                            </div>
                            <p className="text-xs leading-relaxed text-white/60">
                                Cuando está activa, cualquiera puede pedirle una respuesta o mencionarla con
                                <span className="mx-1 font-mono text-[11px] text-[#7fb8ff]">@aurora</span>
                                para que responda automáticamente.
                            </p>
                        </div>
                    </PopoverContent>
                </PopoverPrimitive.Root>
            </div>
        </header>
    );
}

/** Barra de búsqueda dentro del chat: salta entre coincidencias con Enter / Mayús+Enter. */
export function BarraBusquedaHilo({
    texto, onTexto, total, indice, onArriba, onAbajo, onCerrar,
}: {
    texto: string;
    onTexto: (v: string) => void;
    total: number;
    /** Posición de la coincidencia activa, contando desde la más reciente (0 = la última). */
    indice: number;
    /** Coincidencia más antigua (Enter). */
    onArriba: () => void;
    /** Coincidencia más reciente (Mayús+Enter). */
    onAbajo: () => void;
    onCerrar: () => void;
}) {
    const ref = useRef<HTMLInputElement>(null);
    useEffect(() => {
        ref.current?.focus();
    }, []);
    return (
        <div
            role="search"
            className="relative z-10 flex shrink-0 items-center gap-1.5 border-b border-white/[0.08] px-3 py-2"
            style={{ background: "rgba(12,14,34,.5)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}
        >
            <Search className="h-4 w-4 shrink-0 text-white/50" />
            <input
                ref={ref}
                value={texto}
                onChange={(e) => onTexto(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        if (e.shiftKey) onAbajo();
                        else onArriba();
                    }
                    if (e.key === "Escape") onCerrar();
                }}
                placeholder="Buscar en este chat…"
                aria-label="Buscar en este chat"
                className="min-w-0 flex-1 bg-transparent py-1 text-sm text-white outline-none placeholder:text-white/40"
            />
            <span className="shrink-0 text-xs tabular-nums text-white/55" aria-live="polite">
                {texto.trim() ? (total ? `${indice + 1} de ${total}` : "Sin resultados") : ""}
            </span>
            <button type="button" onClick={onArriba} disabled={!total} aria-label="Coincidencia anterior (más antigua)" className={cn(BOTON_ICONO, "h-8 w-8 disabled:cursor-not-allowed disabled:opacity-40")}>
                <ChevronUp className="h-4 w-4" />
            </button>
            <button type="button" onClick={onAbajo} disabled={!total} aria-label="Coincidencia siguiente (más reciente)" className={cn(BOTON_ICONO, "h-8 w-8 disabled:cursor-not-allowed disabled:opacity-40")}>
                <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" onClick={onCerrar} aria-label="Cerrar la búsqueda" className={cn(BOTON_ICONO, "h-8 w-8")}>
                <X className="h-4 w-4" />
            </button>
        </div>
    );
}

export default CabeceraHilo;
