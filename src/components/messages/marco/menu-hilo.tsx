"use client";

/**
 * MenuHilo — menú vertical de un chat o de un correo (2026-09-28). Se abre con «⋯»/«⋮» o con
 * clic derecho sobre la fila. Lista vertical con etiquetas completas; «Silenciar ▸» se despliega
 * DENTRO del mismo menú (un submenú flotante se sale de la pantalla a 360 px).
 *
 * Todo lo que hace es personal: fijar, silenciar, archivar o marcar como leído solo cambia lo
 * que ve quien lo decide.
 */

import { useState, type ComponentType, type CSSProperties } from "react";
import {
    Archive, ArchiveRestore, Bell, BellOff, Check, ChevronRight, MoreHorizontal, MoreVertical, Pin, PinOff, Settings2,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { OPCIONES_SILENCIO } from "@/lib/mensajeria/ajustes";
import { describirSilencio } from "./formato-tiempo";

export interface AccionExtraMenu {
    id: string;
    etiqueta: string;
    icono: ComponentType<{ className?: string; style?: CSSProperties }>;
    onSelect: () => void;
    /** Pista corta a la derecha o debajo. */
    detalle?: string;
    color?: string;
}

export interface MenuHiloProps {
    /** Nombre accesible del disparador («Opciones de Ana»). */
    etiqueta: string;
    abierto: boolean;
    onAbiertoChange: (v: boolean) => void;
    fijado: boolean;
    silencioHasta: string | null;
    archivado: boolean;
    onFijar: () => void;
    onSilenciar: (hasta: string | null) => void;
    onArchivar: () => void;
    onAjustes: () => void;
    onMarcarLeido?: () => void;
    etiquetaAjustes?: string;
    /** Acciones propias antes de las comunes (p. ej. «Destacar» en correos). */
    extrasAntes?: AccionExtraMenu[];
    /** Acciones propias después de «Archivar». */
    extrasDespues?: AccionExtraMenu[];
    orientacion?: "horizontal" | "vertical";
    formato24h?: boolean;
    className?: string;
}

const CLASE_ITEM =
    "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-white/90 outline-none transition-colors duration-150 focus:bg-white/[0.08] data-[highlighted]:bg-white/[0.08]";

export function MenuHilo({
    etiqueta,
    abierto,
    onAbiertoChange,
    fijado,
    silencioHasta,
    archivado,
    onFijar,
    onSilenciar,
    onArchivar,
    onAjustes,
    onMarcarLeido,
    etiquetaAjustes = "Ajustes del chat",
    extrasAntes = [],
    extrasDespues = [],
    orientacion = "horizontal",
    formato24h = true,
    className,
}: MenuHiloProps) {
    const [verSilencio, setVerSilencio] = useState(false);
    const silencio = describirSilencio(silencioHasta, formato24h);
    const Icono = orientacion === "vertical" ? MoreVertical : MoreHorizontal;

    const extra = (a: AccionExtraMenu) => {
        const I = a.icono;
        return (
            <DropdownMenuItem key={a.id} className={CLASE_ITEM} onSelect={() => a.onSelect()}>
                <I className="h-4 w-4 shrink-0" style={a.color ? { color: a.color } : undefined} />
                <span className="flex-1">{a.etiqueta}</span>
                {a.detalle && <span className="text-[11px] text-white/50">{a.detalle}</span>}
            </DropdownMenuItem>
        );
    };

    return (
        <DropdownMenu
            open={abierto}
            onOpenChange={(v) => {
                onAbiertoChange(v);
                if (!v) setVerSilencio(false);
            }}
        >
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    aria-label={etiqueta}
                    title={etiqueta}
                    className={cn(
                        "ss-redondo grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full text-white/55 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] data-[state=open]:bg-white/[0.1] data-[state=open]:text-white",
                        className,
                    )}
                >
                    <Icono className="h-4 w-4" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                sideOffset={6}
                collisionPadding={12}
                className="z-[130] w-[min(88vw,260px)] rounded-2xl border-white/10 bg-[rgba(12,14,34,0.94)] p-1.5 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl"
            >
                {extrasAntes.map(extra)}
                <DropdownMenuItem className={CLASE_ITEM} onSelect={() => onFijar()}>
                    {fijado ? <PinOff className="h-4 w-4 shrink-0" /> : <Pin className="h-4 w-4 shrink-0" />}
                    <span className="flex-1">{fijado ? "Desfijar" : "Fijar"}</span>
                </DropdownMenuItem>

                <DropdownMenuItem
                    className={CLASE_ITEM}
                    aria-expanded={verSilencio}
                    onSelect={(e) => {
                        e.preventDefault();
                        setVerSilencio((v) => !v);
                    }}
                >
                    <BellOff className="h-4 w-4 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <span>Silenciar</span>
                        {silencio && <span className="text-[11px] text-white/50">{silencio}</span>}
                    </span>
                    <ChevronRight className={cn("h-4 w-4 shrink-0 text-white/50 transition-transform duration-150", verSilencio && "rotate-90")} />
                </DropdownMenuItem>
                {verSilencio && (
                    <div role="group" aria-label="Silenciar durante" className="mb-1 ml-4 border-l border-white/10 pl-1.5">
                        {silencio && (
                            <DropdownMenuItem className={CLASE_ITEM} onSelect={() => onSilenciar(null)}>
                                <Bell className="h-4 w-4 shrink-0 text-[#10B981]" />
                                <span className="flex-1">Volver a avisar</span>
                            </DropdownMenuItem>
                        )}
                        {OPCIONES_SILENCIO.map((op) => (
                            <DropdownMenuItem key={op.id} className={CLASE_ITEM} onSelect={() => onSilenciar(op.hasta(new Date()))}>
                                <span className="h-4 w-4 shrink-0" aria-hidden />
                                <span className="flex-1">{op.etiqueta}</span>
                            </DropdownMenuItem>
                        ))}
                    </div>
                )}

                {onMarcarLeido && (
                    <DropdownMenuItem className={CLASE_ITEM} onSelect={() => onMarcarLeido()}>
                        <Check className="h-4 w-4 shrink-0" />
                        <span className="flex-1">Marcar como leído</span>
                    </DropdownMenuItem>
                )}

                <DropdownMenuItem className={CLASE_ITEM} onSelect={() => onArchivar()}>
                    {archivado ? <ArchiveRestore className="h-4 w-4 shrink-0" /> : <Archive className="h-4 w-4 shrink-0" />}
                    <span className="flex-1">{archivado ? "Desarchivar" : "Archivar"}</span>
                </DropdownMenuItem>
                {extrasDespues.map(extra)}

                <DropdownMenuSeparator className="my-1 bg-white/10" />
                <DropdownMenuItem className={CLASE_ITEM} onSelect={() => onAjustes()}>
                    <Settings2 className="h-4 w-4 shrink-0 text-[#7C5CFF]" />
                    <span className="flex-1">{etiquetaAjustes}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

export default MenuHilo;
