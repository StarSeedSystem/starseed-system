/**
 * Personalidad de cada widget libre (Ola 380 · FL4) — PURO.
 *
 * Cada uno de los 104 tipos recibe una forma, una manera de moverse y un acento. Entre widgets no
 * hay que buscar un patrón: solo comparten la estética StarSeed. Primero manda la tabla de los
 * básicos (los de la pantalla de inicio), luego la categoría del manifest y, al final, un hash
 * estable del tipo, para que nada quede sin personalidad ni cambie entre renders.
 */
import { WIDGET_MANIFEST } from "@/components/dashboard/widget-manifest";
import { FORMAS, hashCadena, type TipoForma } from "./formas";

export type Movimiento = "pulso" | "flotar" | "orbitar" | "latido" | "ola" | "quieto";
export interface Personalidad { forma: TipoForma; movimiento: Movimiento; acento: string }

const Z = "#007FFF", H = "#39FF14", E = "#10B981", L = "#FFBF00", G = "#D4AF37", A = "#DC143C", V = "#7c5cff", T = "#23d5ab";

const BASICOS: Record<string, Personalidad> = {
    CLOCK_DATE: { forma: "orbe", movimiento: "orbitar", acento: Z },
    WEATHER_BASIC: { forma: "mancha", movimiento: "flotar", acento: T },
    NOTIFICATIONS: { forma: "gota", movimiento: "latido", acento: A },
    QUICK_ACCESS: { forma: "orbita", movimiento: "orbitar", acento: V },
    SYSTEM_STATUS: { forma: "onda", movimiento: "ola", acento: E },
    MY_EVENTS: { forma: "capsula", movimiento: "pulso", acento: L },
    TASKS_QUICK: { forma: "petalo", movimiento: "pulso", acento: H },
    AURORA_LAST: { forma: "orbe", movimiento: "latido", acento: V },
    MUSIC_PLAYER: { forma: "onda", movimiento: "ola", acento: G },
    MAP_LOCATION: { forma: "hexagono", movimiento: "quieto", acento: E },
};

const POR_CATEGORIA: Record<string, Personalidad> = {
    economia: { forma: "hexagono", movimiento: "pulso", acento: G },
    astronomia: { forma: "orbita", movimiento: "orbitar", acento: Z },
    ontocracia: { forma: "cristal", movimiento: "pulso", acento: L },
    sistema: { forma: "onda", movimiento: "ola", acento: E },
    productividad: { forma: "petalo", movimiento: "pulso", acento: H },
    entretenimiento: { forma: "estrella", movimiento: "flotar", acento: V },
    clima: { forma: "mancha", movimiento: "flotar", acento: T },
    social: { forma: "gota", movimiento: "latido", acento: A },
    descubrimientos: { forma: "estrella", movimiento: "orbitar", acento: T },
    aplicaciones: { forma: "orbita", movimiento: "orbitar", acento: V },
    perfil: { forma: "orbe", movimiento: "latido", acento: V },
    ia: { forma: "orbe", movimiento: "latido", acento: T },
    educacion: { forma: "capsula", movimiento: "flotar", acento: Z },
    ciberdelia: { forma: "mancha", movimiento: "ola", acento: V },
    archivos: { forma: "capsula", movimiento: "quieto", acento: G },
    ubicacion: { forma: "hexagono", movimiento: "quieto", acento: E },
    cultura: { forma: "petalo", movimiento: "flotar", acento: A },
    red: { forma: "cristal", movimiento: "orbitar", acento: Z },
    comunicacion: { forma: "gota", movimiento: "latido", acento: T },
    ayudantia: { forma: "orbe", movimiento: "flotar", acento: H },
    astrologia: { forma: "estrella", movimiento: "orbitar", acento: G },
};

const MOVIMIENTOS: Movimiento[] = ["pulso", "flotar", "orbitar", "latido", "ola"];
const ACENTOS = [Z, H, E, L, G, A, V, T];

export function personalidadDe(tipo: string): Personalidad {
    if (BASICOS[tipo]) return BASICOS[tipo];
    const cat = (WIDGET_MANIFEST as Record<string, { category?: string } | undefined>)[tipo]?.category;
    if (cat && POR_CATEGORIA[cat]) return POR_CATEGORIA[cat];
    const h = hashCadena(tipo);
    const formas = FORMAS.filter((f) => f !== "ninguna");
    return { forma: formas[h % formas.length], movimiento: MOVIMIENTOS[(h >>> 4) % MOVIMIENTOS.length], acento: ACENTOS[(h >>> 8) % ACENTOS.length] };
}
