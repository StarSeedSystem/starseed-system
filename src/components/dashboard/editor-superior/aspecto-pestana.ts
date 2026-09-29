/**
 * Aspecto de las pestañas: icono y color propios (2026-09-28).
 *
 * Campos aditivos del tablero guardado (`icono`, `acento`): viajan en el mismo JSON de
 * localStorage y en el blob sincronizado con la cuenta, sin migración. Solo iconos de lucide.
 */
import {
    Home, Star, Sparkles, Vote, GraduationCap, Palette, Users, Coins, CloudSun, Telescope,
    BrainCircuit, Cpu, Music, Heart, Briefcase, Compass, Leaf, Globe, Rocket, BookOpen,
    MapPin, Wrench, Brush, SlidersHorizontal, Landmark, Network, ListChecks, Wand2, Moon, Sun,
    type LucideIcon,
} from "lucide-react";

export const ICONOS_PESTANA: Record<string, { icono: LucideIcon; nombre: string }> = {
    inicio: { icono: Home, nombre: "Inicio" },
    estrella: { icono: Star, nombre: "Estrella" },
    chispa: { icono: Sparkles, nombre: "Chispa" },
    politica: { icono: Vote, nombre: "Política" },
    educacion: { icono: GraduationCap, nombre: "Educación" },
    arte: { icono: Palette, nombre: "Arte" },
    comunidad: { icono: Users, nombre: "Comunidad" },
    economia: { icono: Coins, nombre: "Economía" },
    clima: { icono: CloudSun, nombre: "Clima" },
    cosmos: { icono: Telescope, nombre: "Cosmos" },
    ia: { icono: BrainCircuit, nombre: "IA" },
    sistema: { icono: Cpu, nombre: "Sistema" },
    musica: { icono: Music, nombre: "Música" },
    bienestar: { icono: Heart, nombre: "Bienestar" },
    trabajo: { icono: Briefcase, nombre: "Trabajo" },
    explorar: { icono: Compass, nombre: "Explorar" },
    naturaleza: { icono: Leaf, nombre: "Naturaleza" },
    red: { icono: Globe, nombre: "Red" },
    proyectos: { icono: Rocket, nombre: "Proyectos" },
    lectura: { icono: BookOpen, nombre: "Lectura" },
    // (2026-09-29) Los iconos propios de cada pestaña temática (temas-pestana.ts).
    lugar: { icono: MapPin, nombre: "Lugar" },
    herramientas: { icono: Wrench, nombre: "Herramientas" },
    pincel: { icono: Brush, nombre: "Pincel" },
    ajustes: { icono: SlidersHorizontal, nombre: "Ajustes" },
    parlamento: { icono: Landmark, nombre: "Parlamento" },
    nodos: { icono: Network, nombre: "Nodos" },
    tareas: { icono: ListChecks, nombre: "Tareas" },
    varita: { icono: Wand2, nombre: "Varita" },
    luna: { icono: Moon, nombre: "Luna" },
    sol: { icono: Sun, nombre: "Sol" },
};

/** Acentos de la identidad del OS (Trinity + áreas). */
export const COLORES_PESTANA: readonly { valor: string; nombre: string }[] = [
    { valor: "#22D3EE", nombre: "Cian" },
    { valor: "#007FFF", nombre: "Azur Zenith" },
    { valor: "#7C5CFF", nombre: "Violeta" },
    { valor: "#10B981", nombre: "Esmeralda Horizon" },
    { valor: "#39FF14", nombre: "Lima" },
    { valor: "#FFBF00", nombre: "Ámbar Logic" },
    { valor: "#DC143C", nombre: "Carmesí Anchor" },
    { valor: "#14B8A6", nombre: "Turquesa" },
    { valor: "#EC4899", nombre: "Rosa" },
];

export function iconoDePestana(clave?: string | null): LucideIcon | undefined {
    return clave ? ICONOS_PESTANA[clave]?.icono : undefined;
}

/** Acento válido (#rrggbb) o undefined: nunca se pinta un valor ajeno. */
export function acentoDePestana(valor?: string | null): string | undefined {
    return typeof valor === "string" && /^#[0-9a-fA-F]{6}$/.test(valor) ? valor : undefined;
}
