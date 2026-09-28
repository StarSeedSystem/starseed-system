/**
 * Acentos por categoría del marco unificado (Ola L6) — PURO.
 *
 * Todos los widgets comparten un solo material (vidrio oscuro, brillo, filo); lo único que
 * cambia de uno a otro es la LUZ de su acento, y esa luz la decide su categoría: una familia
 * política se reconoce por su carmesí, una económica por su esmeralda. Las 29 categorías del
 * catálogo (más «ontocracia» y «comunicacion», que usa el manifiesto) se agrupan en 15
 * familias para que el tablero no se convierta en un arcoíris.
 *
 * Sin `window`, sin red y sin azar: todo entra por parámetro y se puede probar entero.
 */
import { getManifest } from "@/components/dashboard/widget-manifest";

export type FamiliaAcento =
    | "politica" | "educacion" | "cultura" | "economia" | "clima" | "cosmos"
    | "productividad" | "ubicacion" | "social" | "sistema" | "ia" | "archivos"
    | "medios" | "aplicaciones" | "descubrimientos";

export interface AcentoFamilia {
    /** Nombre visible de la familia. */
    etiqueta: string;
    /** Luz principal (hex #rrggbb). */
    acento: string;
    /** Segundo tono del degradado de luz (hex #rrggbb). */
    acento2: string;
}

/** Turquesa StarSeed: el segundo tono por defecto, el mismo que usa WidgetLibre. */
const TURQUESA = "#23d5ab";
/** Violeta StarSeed: segundo tono para las familias que ya son verdes o turquesas. */
const VIOLETA = "#7c5cff";

export const ACENTOS_FAMILIA: Readonly<Record<FamiliaAcento, AcentoFamilia>> = {
    politica: { etiqueta: "Política", acento: "#dc143c", acento2: TURQUESA },
    educacion: { etiqueta: "Educación", acento: "#7c5cff", acento2: TURQUESA },
    cultura: { etiqueta: "Cultura", acento: "#ffbf00", acento2: VIOLETA },
    economia: { etiqueta: "Economía", acento: "#10b981", acento2: VIOLETA },
    clima: { etiqueta: "Clima", acento: "#007fff", acento2: TURQUESA },
    cosmos: { etiqueta: "Cosmos", acento: "#818cf8", acento2: TURQUESA },
    productividad: { etiqueta: "Productividad", acento: "#39ff14", acento2: VIOLETA },
    ubicacion: { etiqueta: "Ubicación", acento: "#14b8a6", acento2: VIOLETA },
    social: { etiqueta: "Social", acento: "#ec4899", acento2: TURQUESA },
    sistema: { etiqueta: "Sistema", acento: "#94a3b8", acento2: TURQUESA },
    ia: { etiqueta: "IA", acento: "#22d3ee", acento2: VIOLETA },
    archivos: { etiqueta: "Archivos", acento: "#e0a43a", acento2: TURQUESA },
    medios: { etiqueta: "Medios", acento: "#d946ef", acento2: TURQUESA },
    aplicaciones: { etiqueta: "Aplicaciones", acento: "#a3e635", acento2: VIOLETA },
    descubrimientos: { etiqueta: "Descubrimientos", acento: "#fb923c", acento2: TURQUESA },
};

/** Categoría del catálogo (widget-categories.ts + las que usa el manifiesto) → familia. */
export const FAMILIA_DE_CATEGORIA: Readonly<Record<string, FamiliaAcento>> = {
    politica: "politica", ontocracia: "politica", parlamento: "politica",
    educacion: "educacion", ayudantia: "educacion",
    cultura: "cultura", arte: "cultura", creatividad: "cultura",
    economia: "economia", sociedad: "economia",
    clima: "clima",
    astronomia: "cosmos", astrologia: "cosmos",
    productividad: "productividad",
    ubicacion: "ubicacion",
    social: "social", comunicacion: "social", perfil: "social",
    sistema: "sistema", red: "sistema", dispositivos: "sistema", privacidad: "sistema",
    utilidades: "sistema", personalizacion: "sistema",
    ia: "ia",
    archivos: "archivos",
    entretenimiento: "medios", ciberdelia: "medios",
    aplicaciones: "aplicaciones",
    descubrimientos: "descubrimientos", explorador: "descubrimientos",
};

/** Familia neutra para lo que aún no tiene categoría: discreta, nunca rota. */
export const FAMILIA_NEUTRA: FamiliaAcento = "sistema";

export function familiaDeCategoria(categoria: string | undefined | null): FamiliaAcento {
    return (categoria && FAMILIA_DE_CATEGORIA[categoria]) || FAMILIA_NEUTRA;
}

/** Categoría de un tipo de widget según su manifiesto (o `undefined`). */
export function categoriaDeTipo(tipo: string): string | undefined {
    return getManifest(tipo as Parameters<typeof getManifest>[0])?.category;
}

export interface AcentoDeWidget extends AcentoFamilia {
    familia: FamiliaAcento;
    categoria?: string;
}

/**
 * El acento de un widget. `forzado` (p. ej. el tinte Trinity elegido en su engranaje) manda
 * sobre la categoría; el segundo tono sigue siendo el de su familia.
 */
export function acentoDeTipo(tipo: string, forzado?: string): AcentoDeWidget {
    const categoria = categoriaDeTipo(tipo);
    const familia = familiaDeCategoria(categoria);
    const base = ACENTOS_FAMILIA[familia];
    const acento = forzado && esHex(forzado) ? normalizarHex(forzado) : base.acento;
    return { ...base, acento, familia, categoria };
}

// ── Utilidades de color (puras) ─────────────────────────────────────────

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function esHex(c: string | undefined | null): c is string {
    return !!c && HEX.test(c.trim());
}

/** `#abc` → `#aabbcc`, en minúsculas. Lo que no es hex se devuelve tal cual. */
export function normalizarHex(c: string): string {
    const t = c.trim().toLowerCase();
    if (!HEX.test(t)) return c;
    if (t.length === 4) return `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`;
    return t;
}

function canales(hex: string): [number, number, number] {
    const n = parseInt(normalizarHex(hex).slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Un color con transparencia. Con hex añade el canal alfa (`#rrggbbaa`); con cualquier otro
 * color CSS (variables, `hsl(...)`) usa `color-mix`, que el OS ya emplea en el kit.
 */
export function conAlfa(color: string, alfa: number): string {
    const a = Math.max(0, Math.min(1, alfa));
    if (esHex(color)) {
        const aa = Math.round(a * 255).toString(16).padStart(2, "0");
        return `${normalizarHex(color)}${aa}`;
    }
    return `color-mix(in srgb, ${color} ${Math.round(a * 100)}%, transparent)`;
}

/** Triple HSL «H S% L%» para las variables `--x-hsl` de Tailwind. */
export function tripleHsl(hex: string): string {
    const [r, g, b] = canales(hex).map((v) => v / 255) as [number, number, number];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    let h = 0, s = 0;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Luminancia relativa WCAG (0 negro … 1 blanco). */
export function luminancia(hex: string): number {
    const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = canales(hex);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Triple HSL del texto que se lee SOBRE el acento: el que más contraste da (WCAG). Con la
 * tinta del OS (L≈0,004) el empate cae en L≈0,19, así que por encima de 0,2 gana la tinta.
 */
export function primerPlanoSobre(hex: string): string {
    return luminancia(hex) > 0.2 ? "232 45% 8%" : "0 0% 100%";
}
