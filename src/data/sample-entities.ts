// src/data/sample-entities.ts
// ─────────────────────────────────────────────────────────────────────────────
// Dataset de EJEMPLO tipado y rico para demostrar la capacidad de páginas,
// perfiles, grupos, apps y archivos en línea dentro de cada uno de los tres
// ecosistemas funcionales de la Red StarSeed (Político, Educativo, Cultural).
//
// Todas las imágenes provienen de servicios LIBRES y fiables (nada de Drive):
//   · Avatares  → DiceBear 9.x  (https://api.dicebear.com/9.x/...)  · CC0
//   · Portadas  → Picsum semilla (https://picsum.photos/seed/<slug>/...) · libre
//   · Archivos de muestra públicos:
//       - PDF   → https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf
//       - Vídeo → https://www.w3schools.com/html/mov_bbb.mp4  (Big Buck Bunny, CC-BY 3.0, Blender Foundation)
//       - Audio → https://www.w3schools.com/html/horse.mp3
//
// El shape de SamplePost reutiliza intencionadamente `NormalizedPost` de
// `@/lib/social-posts`, de modo que pueda pasarse tal cual a <PostCard/>.
// ─────────────────────────────────────────────────────────────────────────────

import type { NormalizedPost, PostMediaKind } from "@/lib/social-posts";

/** Los tres ecosistemas funcionales de la Red. */
export type SystemKey = "politico" | "educativo" | "cultural";

// ── Helpers de imágenes libres ──

/** Avatar determinista vía DiceBear (sin almacenar datos personales). */
export function diceBearAvatar(
    seed: string,
    style:
        | "bottts-neutral"
        | "glass"
        | "shapes"
        | "thumbs"
        | "identicon"
        | "rings"
        | "lorelei" = "glass",
): string {
    return `https://api.dicebear.com/9.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

/** Portada temática determinista vía Picsum (Lorem Picsum, licencia libre). */
export function picsumCover(slug: string, w = 800, h = 400): string {
    return `https://picsum.photos/seed/${encodeURIComponent(slug)}/${w}/${h}`;
}

// URLs públicas de archivos de muestra reutilizables.
export const SAMPLE_PDF =
    "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";
export const SAMPLE_VIDEO = "https://www.w3schools.com/html/mov_bbb.mp4";
export const SAMPLE_AUDIO = "https://www.w3schools.com/html/horse.mp3";

// ── Tipos del dataset ──

export interface SampleProfile {
    id: string;
    system: SystemKey;
    /** Faceta del perfil dentro de la dualidad Cuenta/Perfil del SOSD. */
    facet: "civico" | "artistico" | "educador" | "anonimo" | "profesional";
    name: string;
    handle: string;
    avatar: string;
    bio: string;
    /** Insignias / logros (Meritocracia del Entendimiento). */
    credentials: string[];
    accent: string;
    stats: { label: string; value: string }[];
    verified?: boolean;
}

export interface SamplePage {
    id: string;
    system: SystemKey;
    kind: "ley" | "curso" | "exposicion" | "comunidad" | "obra";
    title: string;
    cover: string;
    description: string;
    members: number;
    accent: string;
    /** Etiqueta de estado contextual (En votación, En curso, Abierta…). */
    status?: string;
    tags: string[];
}

export interface SampleGroup {
    id: string;
    system: SystemKey;
    kind: "asamblea" | "circulo" | "colectivo";
    name: string;
    cover: string;
    avatar: string;
    members: number;
    /** Resumen de actividad reciente (ej. "12 debates esta semana"). */
    activity: string;
    accent: string;
    description: string;
}

export interface SampleApp {
    id: string;
    system: SystemKey;
    name: string;
    /** Semilla de icono DiceBear (estilo bottts/shapes). */
    icon: string;
    description: string;
    category: string;
    accent: string;
    open: boolean;
}

export type SampleFileFormat =
    | "imagen"
    | "video"
    | "audio"
    | "pdf"
    | "enlace"
    | "app"
    | "dataset";

export interface SampleFile {
    id: string;
    system: SystemKey;
    format: SampleFileFormat;
    name: string;
    url: string;
    /** Vista previa (poster/thumbnail) cuando aplica. */
    thumb?: string;
    size?: string;
    /** Atribución / licencia cuando el recurso lo requiere. */
    license?: string;
    accent: string;
}

/** Reutiliza el shape exacto de PostCard + sistema de procedencia. */
export type SamplePost = NormalizedPost & { system: SystemKey };

// Acentos cromáticos por sistema (alineados con la paleta Trinity / oro StarSeed).
export const SYSTEM_ACCENT: Record<SystemKey, string> = {
    politico: "#DC143C", // System Crimson (Anchor / poder público)
    educativo: "#007FFF", // Electric Azure (Zenith / sabiduría)
    cultural: "#39FF14", // Neon Lime (Horizon / génesis creativa)
};

export const SYSTEM_LABEL: Record<SystemKey, string> = {
    politico: "Político",
    educativo: "Educativo",
    cultural: "Cultural",
};

// ─────────────────────────────────────────────────────────────────────────────
// PERFILES
// ─────────────────────────────────────────────────────────────────────────────

export const sampleProfiles: SampleProfile[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// PÁGINAS
// ─────────────────────────────────────────────────────────────────────────────

export const samplePages: SamplePage[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// GRUPOS
// ─────────────────────────────────────────────────────────────────────────────

export const sampleGroups: SampleGroup[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// APPS
// ─────────────────────────────────────────────────────────────────────────────

export const sampleApps: SampleApp[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// ARCHIVOS DE MUESTRA (uno por formato, en cada sistema)
// ─────────────────────────────────────────────────────────────────────────────

export const sampleFiles: SampleFile[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// PUBLICACIONES (shape de PostCard) — una por tipo de media, por sistema
// ─────────────────────────────────────────────────────────────────────────────

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

export const samplePosts: SamplePost[] = [];

// ── Selectores por sistema ──

export function profilesBySystem(s: SystemKey): SampleProfile[] {
    return sampleProfiles.filter((p) => p.system === s);
}
export function pagesBySystem(s: SystemKey): SamplePage[] {
    return samplePages.filter((p) => p.system === s);
}
export function groupsBySystem(s: SystemKey): SampleGroup[] {
    return sampleGroups.filter((g) => g.system === s);
}
export function appsBySystem(s: SystemKey): SampleApp[] {
    return sampleApps.filter((a) => a.system === s);
}
export function filesBySystem(s: SystemKey): SampleFile[] {
    return sampleFiles.filter((f) => f.system === s);
}
export function postsBySystem(s: SystemKey): SamplePost[] {
    return samplePosts.filter((p) => p.system === s);
}

/** Exporto el tipo de media por si el showcase quiere etiquetar formatos. */
export type { PostMediaKind };
