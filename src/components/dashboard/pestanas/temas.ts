/**
 * Identidad de cada pestaña temática (2026-09-29) — PURO.
 *
 * Alex: «cada pestaña de dashboards… mucho más útiles y atractivos». Cada pestaña temática deja de
 * ser «un folder con widgets» y pasa a ser un ESPACIO con identidad propia: icono, lema, la luz de
 * su familia (la misma que llevan sus widgets, `acentos-categoria.ts`) y un ambiente de fondo muy
 * sutil. Lo que la persona elige (icono o color en el editor) manda siempre sobre el tema.
 *
 * Sin `window` ni red: todo entra por parámetro.
 */
import type { LucideIcon } from "lucide-react";
import { ACENTOS_FAMILIA, familiaDeCategoria } from "@/components/widgets-libres/acentos-categoria";
import { acentoDePestana, iconoDePestana } from "../editor-superior/aspecto-pestana";

/** Motivo del fondo ambiental de la pestaña (dibujo estático, muy tenue). */
export type MotivoAmbiente =
    | "aurora" | "hemiciclo" | "estudio" | "pinceladas" | "flujo" | "isobaras" | "enfoque"
    | "topografia" | "herramientas" | "constelacion" | "circuito" | "prisma" | "neuronal" | "red";

export interface TemaPestana {
    categoria: string;
    /** Nombre de la pestaña predeterminada de ese tema. */
    nombre: string;
    /** Para qué es este espacio, en una línea (se enseña en la cabecera, en el editor y en las plantillas). */
    lema: string;
    /** Clave de `ICONOS_PESTANA` (aspecto-pestana.ts). */
    icono: string;
    acento: string;
    acento2: string;
    motivo: MotivoAmbiente;
}

type DefTema = Omit<TemaPestana, "categoria" | "acento" | "acento2"> & { acento?: string; acento2?: string };

/** Los temas de las pestañas (las 18 predeterminadas y las de «crear desde plantilla»). */
const DEFS: Record<string, DefTema> = {
    // Inicio lleva la luz de StarSeed (violeta + turquesa), no la de la familia social.
    social: { nombre: "Inicio", lema: "Tu día de un vistazo", icono: "inicio", motivo: "aurora", acento: "#7c5cff", acento2: "#23d5ab" },
    politica: { nombre: "Política", lema: "Deliberar y decidir en común", icono: "politica", motivo: "hemiciclo" },
    educacion: { nombre: "Educación", lema: "Aprender con propósito", icono: "educacion", motivo: "estudio" },
    cultura: { nombre: "Cultura", lema: "Expresión, música y encuentros", icono: "arte", motivo: "pinceladas" },
    economia: { nombre: "Economía", lema: "El flujo del procomún", icono: "economia", motivo: "flujo" },
    clima: { nombre: "Clima", lema: "El cielo de tu lugar, en vivo", icono: "clima", motivo: "isobaras" },
    productividad: { nombre: "Productividad", lema: "Enfoque y avance del día", icono: "tareas", motivo: "enfoque" },
    ubicacion: { nombre: "Ubicación", lema: "Tu lugar en el mapa", icono: "lugar", motivo: "topografia" },
    utilidades: { nombre: "Utilidades", lema: "Herramientas a mano", icono: "herramientas", motivo: "herramientas" },
    arte: { nombre: "Arte", lema: "Tu galería viva", icono: "pincel", motivo: "pinceladas", acento: "#d946ef", acento2: "#ffbf00" },
    astronomia: { nombre: "Astronomía", lema: "El cosmos en tiempo real", icono: "cosmos", motivo: "constelacion" },
    sistema: { nombre: "Sistema", lema: "Tu nodo, sano y sincronizado", icono: "sistema", motivo: "circuito", acento: "#22d3ee", acento2: "#94a3b8" },
    personalizacion: { nombre: "Personalización", lema: "Tu sistema, a tu medida", icono: "ajustes", motivo: "prisma", acento: "#a78bfa", acento2: "#f472b6" },
    ia: { nombre: "IA", lema: "Tu exocórtex", icono: "ia", motivo: "neuronal" },
    parlamento: { nombre: "Parlamento", lema: "Asambleas, consejo y justicia restaurativa", icono: "parlamento", motivo: "hemiciclo", acento: "#f59e0b", acento2: "#dc143c" },
    red: { nombre: "Red", lema: "Tu constelación de personas y nodos", icono: "nodos", motivo: "red", acento: "#38bdf8", acento2: "#ec4899" },
    explorador: { nombre: "Explorador", lema: "Descubrir lo inesperado", icono: "explorar", motivo: "topografia" },
    creatividad: { nombre: "Creativo", lema: "Crear ya, sin esperar", icono: "varita", motivo: "pinceladas", acento: "#f472b6", acento2: "#7c5cff" },
    // ── Temas de «crear desde plantilla» ──
    astrologia: { nombre: "Astrología", lema: "Ciclos, tránsitos y sincronías", icono: "luna", motivo: "constelacion", acento: "#fb7185", acento2: "#818cf8" },
    archivos: { nombre: "Archivos", lema: "Tus documentos y memorias", icono: "lectura", motivo: "estudio" },
    entretenimiento: { nombre: "Entretenimiento", lema: "Música, radio y mundos", icono: "musica", motivo: "pinceladas" },
    ayudantia: { nombre: "Ayudantía", lema: "Cuidarte y pedir ayuda", icono: "bienestar", motivo: "aurora" },
    ciberdelia: { nombre: "Ciberdelia", lema: "Experiencias que expanden", icono: "chispa", motivo: "prisma" },
    descubrimientos: { nombre: "Descubrimientos", lema: "Datos vivos del mundo", icono: "explorar", motivo: "constelacion" },
    privacidad: { nombre: "Privacidad", lema: "Tu membrana y tu soberanía", icono: "sistema", motivo: "circuito", acento: "#8b5cf6", acento2: "#22d3ee" },
    dispositivos: { nombre: "Dispositivos", lema: "Tu hábitat conectado", icono: "inicio", motivo: "circuito", acento: "#fbbf24", acento2: "#14b8a6" },
    perfil: { nombre: "Perfil", lema: "Mérito, identidad y legado", icono: "estrella", motivo: "aurora" },
    sociedad: { nombre: "Sociedad", lema: "El pulso del organismo común", icono: "red", motivo: "red" },
    aplicaciones: { nombre: "Aplicaciones", lema: "Tus apps a un toque", icono: "chispa", motivo: "herramientas" },
};

/** Tema neutro para pestañas sin categoría conocida (las creadas por la persona). */
const NEUTRO: TemaPestana = {
    categoria: "",
    nombre: "Pestaña",
    lema: "Tu espacio",
    icono: "estrella",
    acento: "#7c5cff",
    acento2: "#23d5ab",
    motivo: "aurora",
};

/** Tema de una categoría (o el neutro). Nunca lanza. */
export function temaDeCategoria(categoria: string | null | undefined): TemaPestana {
    const def = categoria ? DEFS[categoria] : undefined;
    if (!def || !categoria) return NEUTRO;
    const fam = ACENTOS_FAMILIA[familiaDeCategoria(categoria)];
    return {
        categoria,
        nombre: def.nombre,
        lema: def.lema,
        icono: def.icono,
        motivo: def.motivo,
        acento: def.acento ?? fam.acento,
        acento2: def.acento2 ?? fam.acento2,
    };
}

/** Categorías con tema propio. */
export function categoriasConTema(): string[] {
    return Object.keys(DEFS);
}

export interface PestanaConAspecto {
    category?: string | null;
    icono?: string | null;
    acento?: string | null;
}

export interface AspectoResuelto {
    tema: TemaPestana;
    icono: LucideIcon | undefined;
    /** Clave del icono que se ve (la elegida o la del tema). */
    claveIcono: string;
    acento: string;
    acento2: string;
    /** true si el icono o el color son los que la persona eligió. */
    propio: boolean;
}

/** Lo que se pinta de una pestaña: lo elegido por la persona manda sobre el tema. */
export function aspectoDe(d: PestanaConAspecto): AspectoResuelto {
    const tema = temaDeCategoria(d.category ?? null);
    const iconoPropio = iconoDePestana(d.icono ?? undefined);
    const acentoPropio = acentoDePestana(d.acento ?? undefined);
    const claveIcono = iconoPropio && d.icono ? d.icono : tema.icono;
    return {
        tema,
        icono: iconoPropio ?? iconoDePestana(tema.icono),
        claveIcono,
        acento: acentoPropio ?? tema.acento,
        acento2: tema.acento2,
        propio: Boolean(iconoPropio || acentoPropio),
    };
}

/** `#rrggbb` + alfa (0..1) → `#rrggbbaa`. Si el color no es válido, un blanco tenue. */
export function conAlfa(hex: string, alfa: number): string {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return `#ffffff${Math.round(Math.max(0, Math.min(1, alfa)) * 255).toString(16).padStart(2, "0")}`;
    const a = Math.round(Math.max(0, Math.min(1, alfa)) * 255).toString(16).padStart(2, "0");
    return `${hex}${a}`;
}
