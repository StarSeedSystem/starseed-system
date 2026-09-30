"use client";
/**
 * Temas para los widgets de apariencia del paquete E (Ola 0929): los datos de las identidades del
 * sistema (los mismos colores que Ajustes → Apariencia → «Tema del sistema»), las atmósferas de
 * next-themes y una vista previa en miniatura que se entiende de un vistazo: fondo, tarjeta, botón
 * primario, acento y tipografía. Solo LEE la API de apariencia; aplicar lo hace el widget.
 */
import * as React from "react";
import type { AppearanceConfig, OsThemeId } from "@/context/appearance-context";

/** [fondo, tarjeta, primario, acento] */
export type Paleta = [string, string, string, string];

export interface Identidad { id: OsThemeId; nombre: string; /** Nombre corto para rótulos estrechos (el completo va en aria-label/title). */ corto?: string; lema: string; oscuro: Paleta; claro: Paleta; serif?: boolean }

export const IDENTIDADES: Identidad[] = [
    { id: "default", nombre: "Aurora StarSeed", corto: "Aurora", lema: "Nebulosa violeta y cian: la identidad original.", oscuro: ["#0a0118", "#160b30", "#c084fc", "#22d3ee"], claro: ["#f6f3fb", "#fdfcff", "#9333ea", "#0f766e"] },
    { id: "cafe", nombre: "StarSeed Café", corto: "Café", lema: "Verde noche y oro fundido, con serif Fraunces.", oscuro: ["#0d130e", "#141b14", "#e9c46a", "#9fe870"], claro: ["#fdf7ea", "#fefbf2", "#c05c3b", "#3f7a2a"], serif: true },
    { id: "omnifrecuencias", nombre: "Omnifrecuencias", corto: "Omni", lema: "Holograma cian y violeta sobre negro profundo.", oscuro: ["#030712", "#0a1626", "#22d3ee", "#a855f7"], claro: ["#eef9fc", "#fbfeff", "#0891b2", "#7c3aed"] },
    { id: "audiomorphic", nombre: "Audiomorphic", corto: "Audio", lema: "Geometría sagrada: violeta y oro, ceremonial.", oscuro: ["#08040f", "#150b24", "#a855f7", "#d4af37"], claro: ["#f6f1fd", "#fdfbff", "#7c3aed", "#b8860b"] },
];

export interface Atmosfera { id: string; nombre: string; paleta: Paleta; clara?: boolean }

/** Atmósferas de next-themes (las muestras son aproximadas: el tema real lo pinta el CSS global). */
export const ATMOSFERAS: Atmosfera[] = [
    { id: "dark", nombre: "Obsidiana", paleta: ["#0a0a12", "#17172a", "#a78bfa", "#22d3ee"] },
    { id: "light", nombre: "Alabastro", paleta: ["#f4f1ea", "#ffffff", "#6d28d9", "#f59e0b"], clara: true },
    { id: "liquid-crystal", nombre: "Cristal líquido", paleta: ["#04131a", "#0b2530", "#06b6d4", "#a5f3fc"] },
    { id: "glass", nombre: "Vidrio prisma", paleta: ["#0d1030", "#1b1f4d", "#6366f1", "#a78bfa"] },
    { id: "natural", nombre: "Pulso de Gaia", paleta: ["#0b1a12", "#132a1c", "#10b981", "#fbbf24"] },
    { id: "grey", nombre: "Monolito", paleta: ["#18181b", "#27272a", "#94a3b8", "#e2e8f0"] },
];

export function identidadDe(id: string | undefined): Identidad {
    return IDENTIDADES.find((x) => x.id === id) ?? IDENTIDADES[0];
}

/** Paleta de un tema guardado, leída de su propia configuración (identidad + fondo + radio). */
export function paletaDeGuardado(cfg: Partial<AppearanceConfig> | undefined): { paleta: Paleta; serif: boolean; radio: number; fondo: string } {
    const ident = identidadDe(cfg?.themeStore?.osTheme);
    const p: Paleta = [...ident.oscuro] as Paleta;
    const liq = (cfg?.background as { liquidColors?: string[] } | undefined)?.liquidColors;
    const viva = cfg?.background?.living?.colors;
    const extra = (Array.isArray(viva) && viva.length ? viva : Array.isArray(liq) ? liq : []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
    if (extra[0]) p[2] = extra[0];
    if (extra[1]) p[3] = extra[1];
    const radio = typeof cfg?.styling?.radius === "number" ? Math.max(0, Math.min(1.5, cfg.styling.radius)) : 0.75;
    const fondo = cfg?.background?.type ?? "gradient";
    return { paleta: p, serif: !!ident.serif, radio, fondo };
}

const NOMBRE_FONDO: Record<string, string> = {
    solid: "sólido", gradient: "degradado", image: "imagen", video: "vídeo", webgl: "WebGL", spline: "Spline", living: "fondo vivo",
    "liquid-aurora": "aurora líquida", "liquid-plasma": "plasma", "liquid-lava": "lava", "liquid-oceanic": "océano", "liquid-iris": "iris",
    "materia-oro-vivo": "oro vivo", "materia-cristal-liquido": "cristal líquido", "materia-bosque-dorado": "bosque dorado", audiomorphic: "audiomorphic",
};
export function nombreFondo(t: string): string { return NOMBRE_FONDO[t] ?? t; }

/** Ventana en miniatura: así se verá el OS con esta paleta. Puramente visual (aria-hidden). */
export function VentanaTema({ paleta, ancho, alto, serif, radio = 0.75, activa }: { paleta: Paleta; ancho: number; alto: number; serif?: boolean; radio?: number; activa?: boolean }) {
    const [bg, card, primario, acento] = paleta;
    const claro = /^#[ef]/i.test(bg);
    const tinta = claro ? "rgba(30,20,40,.85)" : "rgba(240,244,255,.9)";
    const r = Math.max(3, Math.min(14, radio * 10));
    const id = React.useId().replace(/:/g, "");
    return (
        <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden className="block shrink-0 overflow-visible">
            <defs>
                <radialGradient id={`vt-${id}`} cx="80%" cy="0%" r="120%">
                    <stop offset="0%" stopColor={card} />
                    <stop offset="70%" stopColor={bg} />
                </radialGradient>
            </defs>
            <rect x={0} y={0} width={ancho} height={alto} rx={Math.min(16, ancho * 0.1)} fill={`url(#vt-${id})`} stroke={activa ? acento : "rgba(255,255,255,.14)"} strokeWidth={activa ? 2 : 1} />
            {/* barra superior */}
            {[0, 1, 2].map((i) => <circle key={i} cx={ancho * 0.08 + i * ancho * 0.05} cy={alto * 0.12} r={Math.max(1.5, ancho * 0.015)} fill={i === 0 ? acento : claro ? "rgba(0,0,0,.2)" : "rgba(255,255,255,.25)"} />)}
            <text x={ancho * 0.08} y={alto * 0.36} fontSize={Math.max(9, alto * 0.17)} fontWeight={600} fill={tinta} fontFamily={serif ? "Fraunces, Georgia, serif" : "Inter, system-ui, sans-serif"}>Aa</text>
            {/* tarjeta */}
            <rect x={ancho * 0.08} y={alto * 0.46} width={ancho * 0.56} height={alto * 0.3} rx={r * 0.6} fill={card} stroke={`${primario}66`} strokeWidth={1} />
            <rect x={ancho * 0.13} y={alto * 0.54} width={ancho * 0.36} height={Math.max(2, alto * 0.04)} rx={2} fill={tinta} opacity={0.5} />
            <rect x={ancho * 0.13} y={alto * 0.64} width={ancho * 0.24} height={Math.max(2, alto * 0.04)} rx={2} fill={tinta} opacity={0.3} />
            {/* botón primario y acento */}
            <rect x={ancho * 0.08} y={alto * 0.82} width={ancho * 0.34} height={Math.max(5, alto * 0.1)} rx={Math.max(2.5, alto * 0.05)} fill={primario} />
            <circle cx={ancho * 0.55} cy={alto * 0.87} r={Math.max(3, alto * 0.055)} fill={acento} style={{ filter: `drop-shadow(0 0 4px ${acento})` }} />
            {/* orbe de luz */}
            <circle cx={ancho * 0.82} cy={alto * 0.52} r={Math.min(ancho, alto) * 0.16} fill={primario} opacity={0.85} />
            <circle cx={ancho * 0.86} cy={alto * 0.46} r={Math.min(ancho, alto) * 0.07} fill={acento} opacity={0.9} />
        </svg>
    );
}
