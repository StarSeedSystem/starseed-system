"use client";

/**
 * Piezas visuales comunes de las apps en vivo: icono por tipo, chips de permiso y de acceso,
 * y el material de cristal de la sección. Sin estado ni red.
 */

import type { CSSProperties, ReactNode } from "react";
import {
    AppWindow,
    Box,
    DoorOpen,
    Eye,
    FileText,
    Gamepad2,
    Glasses,
    Globe,
    Globe2,
    LayoutDashboard,
    MessageSquare,
    Monitor,
    PenTool,
    Pencil,
    Phone,
    Presentation,
    Sparkles,
    Table2,
    UserPlus,
    Users,
    Video,
    type LucideIcon,
} from "lucide-react";
import type { ModoAcceso, PermisoVivo } from "@/lib/mensajeria/formato-tipos";
import type { EntradaCatalogoVivo, NombreIconoVivo } from "@/components/messages/vivo/catalogo-vivo";

export const VIOLETA_MENSAJES = "#7C5CFF";

const ICONOS: Record<NombreIconoVivo, LucideIcon> = {
    DoorOpen,
    PenTool,
    FileText,
    Presentation,
    Table2,
    Globe,
    Gamepad2,
    AppWindow,
    Monitor,
    LayoutDashboard,
    Box,
    Glasses,
    Phone,
    Video,
};

export function iconoVivo(nombre: NombreIconoVivo | null | undefined): LucideIcon {
    return (nombre && ICONOS[nombre]) || Sparkles;
}

export const PERMISOS_INFO: Record<PermisoVivo, { etiqueta: string; corta: string; icono: LucideIcon; ayuda: string }> = {
    ver: { etiqueta: "Solo ver", corta: "Solo ver", icono: Eye, ayuda: "Miran en directo, sin tocar nada." },
    comentar: { etiqueta: "Pueden comentar", corta: "Comentar", icono: MessageSquare, ayuda: "Miran y dejan comentarios." },
    editar: { etiqueta: "Pueden editar", corta: "Editar", icono: Pencil, ayuda: "Cambian el contenido contigo." },
};

export const MODOS_INFO: Record<ModoAcceso, { etiqueta: string; icono: LucideIcon; ayuda: string }> = {
    chat: { etiqueta: "Este chat", icono: Users, ayuda: "Entran las personas de esta conversación." },
    invitados: { etiqueta: "Chat e invitados", icono: UserPlus, ayuda: "Los del chat y las personas que elijas." },
    publico: { etiqueta: "Enlace público", icono: Globe2, ayuda: "Cualquiera con el enlace, aunque no tenga cuenta." },
};

/** Texto legible sobre un fondo de color: casi negro sobre colores claros (ámbar, lima, cian), blanco sobre el resto. */
export function colorTextoSobre(hex: string): string {
    const m = /^#?([0-9a-f]{6})/i.exec(hex ?? "");
    if (!m) return "#fff";
    const n = parseInt(m[1], 16);
    const canal = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = 0.2126 * canal((n >> 16) & 255) + 0.7152 * canal((n >> 8) & 255) + 0.0722 * canal(n & 255);
    return lum > 0.4 ? "#0b0d1a" : "#fff";
}

/** Material de cristal de los paneles de la sección. */
export const ESTILO_CRISTAL: CSSProperties = {
    background: "rgba(12,14,34,.55)",
    backdropFilter: "blur(20px) saturate(140%)",
    WebkitBackdropFilter: "blur(20px) saturate(140%)",
    border: "1px solid rgba(255,255,255,.08)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 12px 32px -16px rgba(0,0,0,.6)",
};

/** Burbuja de color con el icono del tipo. */
export function IconoTipoVivo({
    entrada,
    tam = 40,
    apagado = false,
}: {
    entrada: Pick<EntradaCatalogoVivo, "icono" | "color"> | null;
    tam?: number;
    apagado?: boolean;
}) {
    const Icono = iconoVivo(entrada?.icono);
    const color = apagado ? "#9CA3AF" : entrada?.color ?? VIOLETA_MENSAJES;
    return (
        <span
            aria-hidden="true"
            className="grid shrink-0 place-items-center rounded-2xl"
            style={{
                width: tam,
                height: tam,
                background: `linear-gradient(135deg, ${color}40, ${color}14)`,
                boxShadow: `inset 0 0 0 1px ${color}66, inset 0 1px 0 rgba(255,255,255,.12)`,
                color,
            }}
        >
            <Icono style={{ width: Math.round(tam * 0.5), height: Math.round(tam * 0.5) }} strokeWidth={2} />
        </span>
    );
}

/** Pastilla fantasma de información (no clicable). */
export function ChipVivo({
    color = VIOLETA_MENSAJES,
    icono: Icono,
    children,
    titulo,
}: {
    color?: string;
    icono?: LucideIcon;
    children: ReactNode;
    titulo?: string;
}) {
    return (
        <span
            title={titulo}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white/90"
            style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` }}
        >
            {Icono ? <Icono className="h-3 w-3" style={{ color }} aria-hidden="true" /> : null}
            {children}
        </span>
    );
}

/** Rótulo de sección (11 px, versalitas). */
export function RotuloVivo({ children, id }: { children: ReactNode; id?: string }) {
    return (
        <p id={id} className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
            {children}
        </p>
    );
}
