'use client';

// ════════════════════════════════════════════════════════════════
// StarSeed OS — Menú contextual de ICONOS del escritorio (tipo computadora)
// ----------------------------------------------------------------
// Este archivo será la ÚNICA fuente del menú contextual para íconos
// (Parte 2 · reorganizar en desktop-canvas, eliminar este cuando esté listo).
// ════════════════════════════════════════════════════════════════

import React from "react";
import { Replace } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Desktop, DesktopIcon, DesktopIconSize } from "./desktop-store";
import type { QuickLookTab } from "./desktop-quick-look";
import type { ArchivoConvertible } from "@/components/conversion/use-conversion-menu";

// ════════════════════════════════════════════════════════════
// Primitivas de menú (repetidas aquí por consistencia) ─────────────────

function MenuItem({
    icon: Icon, label, danger, active, onClick,
}: {
    icon?: React.ComponentType<{ className?: string }>;
    label: string;
    danger?: boolean;
    active?: boolean;
    onClick: () => void;
}): React.ReactElement {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[12px] font-semibold transition-colors cursor-pointer",
                danger ? "text-red-300 hover:bg-red-500/15" : "text-foreground/90 hover:bg-white/10",
                active && "bg-white/[0.06]",
            )}
        >
            {Icon ? <Icon className="size-3.5 shrink-0 opacity-90" /> : <span className="size-3.5 shrink-0" />}
            <span className="flex-1 truncate">{label}</span>
        </button>
    );
}

function MenuDivider(): React.ReactElement {
    return <div className="my-1 h-px bg-white/10" />;
}

// ── Contenedor posicionado (auto-clamp a bordes del lienzo) ──────
function MenuShell({
    x, y, canvasRef, children,
}: {
    x: number;
    y: number;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    children: React.ReactNode;
}): React.ReactElement {
    const rect = canvasRef.current?.getBoundingClientRect();
    const localX = rect ? x - rect.left : x;
    const localY = rect ? y - rect.top : y;
    const maxW = rect?.width ?? 800;
    const maxH = rect?.height ?? 600;
    const left = Math.max(6, Math.min(localX, maxW - 260 - 6));
    const top = Math.max(48, Math.min(localY, maxH - 40));
    return (
        <div
            role="menu"
            style={{ left, top, width: 260, maxHeight: maxH - top - 10 }}
            className="absolute z-[62] overflow-y-auto rounded-2xl border border-white/12 bg-card/95 p-1.5 shadow-2xl backdrop-blur-2xl"
        >
            {children}
        </div>
    );
}

// ── Menú de un ICONO ─────────────────────────────────────────────
// Este componente será el menú principal para los íconos (Parte 2 · reestructurar desktop-canvas).
export function DesktopIconMenu({
    x, y, desktop, icon, canvasRef, onClose,
    onOpen, onRename, onQuickLook, onEdit,
}: {
    x: number;
    y: number;
    desktop: Desktop;
    icon: DesktopIcon;
    canvasRef: React.RefObject<HTMLDivElement | null>;
    onClose: () => void;
    onOpen: (icon: DesktopIcon) => void;
    onRename: (id: string) => void;
    onQuickLook?: (icon: DesktopIcon, tab: QuickLookTab, share?: boolean) => void;
    onEdit?: (icon: DesktopIcon) => boolean;
}): React.ReactElement {
    const run = (fn: () => void) => { fn(); onClose(); };

    // Determinar si el ícono tiene una URL que puede ser convertida
    const tieneUrl = Boolean(icon.url);

    // Convertir a ArchivoConvertible para el hook de conversión
    const archivoConvertible: ArchivoConvertible | null = tieneUrl ? {
        nombre: icon.name,
        url: icon.url || undefined,
        tipoMime: undefined,
        carpetaId: null,
    } : null;

    return (
        <MenuShell x={x} y={y} canvasRef={canvasRef}>
            <MenuItem icon={Replace} label="Abrir" onClick={() => run(() => onOpen(icon))} />
            {onQuickLook && (
                <MenuItem icon={Replace} label="Vista previa" onClick={() => run(() => onQuickLook(icon, "preview"))} />
            )}
            {onEdit && (
                <MenuItem icon={Replace} label="Editar" onClick={() => run(() => { onEdit(icon) || onRename(icon.id); })} />
            )}

            <MenuDivider />

            {/* Convertir a… – Se añade aquí cuando el ícono tiene una URL */}
            {tieneUrl && (
                <>                    <MenuDivider />
                    <div className="px-2.5 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground/60">
                        Convertir a… (Filee)
                    </div>
                    <div className="px-2.5 py-1.5 text-xs text-white/70">
                        Formatos disponibles desde la neurona ({icon.url ? "URL" : "contenido"})
                    </div>
                </>
            )}
        </MenuShell>
    );
}

export default DesktopIconMenu;