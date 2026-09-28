/**
 * iconos — resuelve los nombres de icono que declaran `RELACIONES` y `TIPOS_NOTA`
 * (strings de lucide-react) a sus componentes, con respaldo defensivo.
 */

import {
    Bell,
    Briefcase,
    Coffee,
    Compass,
    Flag,
    Gift,
    GraduationCap,
    Heart,
    Home,
    Lightbulb,
    MapPin,
    MessageCircle,
    Phone,
    Smile,
    Sparkles,
    Stethoscope,
    StickyNote,
    Users,
    Wrench,
    type LucideIcon,
} from "lucide-react";

import type { TipoNota, TipoRelacion } from "@/lib/contactos/tipos";
import { infoNota, infoRelacion } from "@/components/contactos/app/estilos";

const MAPA: Record<string, LucideIcon> = {
    Home,
    Heart,
    Smile,
    Users,
    Briefcase,
    GraduationCap,
    Compass,
    MapPin,
    Stethoscope,
    Wrench,
    Sparkles,
    StickyNote,
    Coffee,
    Phone,
    MessageCircle,
    Flag,
    Bell,
    Gift,
    Lightbulb,
};

export function iconoLucide(nombre: string | undefined): LucideIcon {
    return (nombre && MAPA[nombre]) || Sparkles;
}

export function iconoRelacion(id: TipoRelacion | undefined | null): LucideIcon {
    return iconoLucide(infoRelacion(id).icono);
}

export function iconoNota(tipo: TipoNota | undefined | null): LucideIcon {
    return iconoLucide(infoNota(tipo).icono);
}
