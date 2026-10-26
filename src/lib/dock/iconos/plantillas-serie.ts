/**
 * Plantillas de iconos «de serie» del dock (Ola 1025U · V1b) — puras y siempre disponibles, sin red.
 *
 *   · Trinity          — cuadrado suave con degradado Trinity por familia de iconos.
 *   · Cristal líquido  — círculos de cristal tintado con brillo especular (la identidad de StarSeed).
 *   · Flor de la vida  — la silueta de seis pétalos, en dorados y violetas.
 *   · Monocromo        — líneas limpias, sin color: calma y legibilidad.
 *
 * Cada plantilla trae un diseño por familia de iconos (comunicación, conocimiento, sistema, mundo) y uno
 * «por defecto» para cualquier icono que no esté en una familia (también los que el usuario añada después).
 * Los glifos son siempre `auto`: cada icono conserva su Lucide propio, solo cambia el vestido.
 */

import {
    LICENCIA_DEFECTO,
    VERSION_DISENO,
    normalizarPlantilla,
    type DisenoIcono,
    type FondoIcono,
    type FormaIcono,
    type PlantillaIconos,
} from "./modelo";

export type FamiliaIcono = "comunicacion" | "conocimiento" | "sistema" | "mundo";

/** Familia de cada `iconKey` del dock (los que no están aquí usan el diseño por defecto). */
export const FAMILIA_DE_ICONO: Readonly<Record<string, FamiliaIcono>> = {
    // comunicación y personas
    MessagesSquare: "comunicacion", Bell: "comunicacion", Users: "comunicacion", CircleUser: "comunicacion",
    Smile: "comunicacion", BookUser: "comunicacion", Radio: "comunicacion", Rss: "comunicacion",
    Cast: "comunicacion", AudioLines: "comunicacion", Antenna: "comunicacion", RadioTower: "comunicacion",
    // conocimiento y creación
    BookOpen: "conocimiento", Library: "conocimiento", Brain: "conocimiento", BrainCircuit: "conocimiento",
    Lightbulb: "conocimiento", FlaskConical: "conocimiento", Atom: "conocimiento", Sparkles: "conocimiento",
    FileText: "conocimiento", Table2: "conocimiento", PenLine: "conocimiento",
    // sistema y herramientas
    Settings: "sistema", Server: "sistema", Cpu: "sistema", HardDrive: "sistema", Wrench: "sistema",
    Plug: "sistema", GitBranch: "sistema", Network: "sistema", Gauge: "sistema", ShieldCheck: "sistema",
    Zap: "sistema", Boxes: "sistema",
    // mundo, comunidad y exploración
    LayoutDashboard: "mundo", LayoutGrid: "mundo", Compass: "mundo", AppWindow: "mundo", Box: "mundo",
    Vote: "mundo", Award: "mundo", ShoppingBag: "mundo", CalendarClock: "mundo", Camera: "mundo",
    Images: "mundo", Gamepad2: "mundo", Glasses: "mundo", Eye: "mundo",
};

const FAMILIAS: readonly FamiliaIcono[] = ["comunicacion", "conocimiento", "sistema", "mundo"];

/** Paleta Trinity ampliada (los mismos tonos que `--trinity-*` de globals.css). */
const TRINITY = {
    azure: "#007fff", lime: "#38ff14", emerald: "#10b77f", amber: "#ffbf00", crimson: "#db143c",
    cyan: "#23ddf6", magenta: "#f042f0", violet: "#a02bee", rose: "#f54781", indigo: "#5151ec",
} as const;

const GLIFO_AUTO = { tipo: "lucide", clave: "auto" } as const;

interface Parametros {
    forma: FormaIcono;
    fondo: FondoIcono;
    colorGlifo: string;
    escala: number;
    brillo: number;
    borde?: { color: string; ancho: number };
    nombre: string;
}

function diseno(p: Parametros): DisenoIcono {
    const d: DisenoIcono = {
        v: VERSION_DISENO,
        forma: p.forma,
        fondo: p.fondo,
        glifo: { ...GLIFO_AUTO },
        colorGlifo: p.colorGlifo,
        escala: p.escala,
        brillo: p.brillo,
        nombre: p.nombre,
        origen: "serie",
    };
    if (p.borde) d.borde = p.borde;
    return d;
}

interface Receta {
    id: string;
    nombre: string;
    descripcion: string;
    etiquetas: string[];
    porDefecto: Parametros;
    porFamilia?: Record<FamiliaIcono, Parametros>;
}

function construir(r: Receta): PlantillaIconos {
    const disenos: Record<string, DisenoIcono> = {};
    if (r.porFamilia) {
        for (const [iconKey, fam] of Object.entries(FAMILIA_DE_ICONO)) {
            disenos[iconKey] = diseno(r.porFamilia[fam]);
        }
    }
    const plantilla = normalizarPlantilla({
        v: VERSION_DISENO,
        id: r.id,
        nombre: r.nombre,
        descripcion: r.descripcion,
        autor: "StarSeed",
        licencia: LICENCIA_DEFECTO,
        porDefecto: diseno(r.porDefecto),
        disenos,
        etiquetas: r.etiquetas,
    });
    // Las plantillas de serie son datos estáticos: si el normalizador las rechazara sería un fallo de programación.
    if (!plantilla) throw new Error(`Plantilla de serie no válida: ${r.id}`);
    return Object.freeze(plantilla) as PlantillaIconos;
}

/* ─────────────────────────── Trinity ─────────────────────────── */

const degradado = (desde: string, hasta: string, angulo = 135): FondoIcono => ({ tipo: "degradado", desde, hasta, angulo });
const cristal = (tinte: string, intensidad = 0.55): FondoIcono => ({ tipo: "cristal", tinte, intensidad });

const trinity = (desde: string, hasta: string, nombre: string): Parametros => ({
    forma: "cuadrado-suave",
    fondo: degradado(desde, hasta),
    colorGlifo: "#ffffff",
    escala: 0.56,
    brillo: 0.35,
    borde: { color: "#ffffff55", ancho: 1.2 },
    nombre,
});

const TRINITY_PLANTILLA = construir({
    id: "serie-trinity",
    nombre: "Trinity",
    descripcion: "Cuadrados suaves con degradados de la paleta Trinity, un color por familia de iconos.",
    etiquetas: ["serie", "trinity", "color"],
    porDefecto: trinity(TRINITY.azure, TRINITY.indigo, "Trinity · azul"),
    porFamilia: {
        comunicacion: trinity(TRINITY.magenta, TRINITY.violet, "Trinity · comunicación"),
        conocimiento: trinity(TRINITY.cyan, TRINITY.azure, "Trinity · conocimiento"),
        sistema: trinity(TRINITY.amber, TRINITY.crimson, "Trinity · sistema"),
        mundo: trinity(TRINITY.emerald, TRINITY.lime, "Trinity · mundo"),
    },
});

/* ─────────────────────────── Cristal líquido ─────────────────────────── */

const cristalLiquido = (tinte: string, nombre: string): Parametros => ({
    forma: "circulo",
    fondo: cristal(tinte, 0.6),
    colorGlifo: "#ffffff",
    escala: 0.54,
    brillo: 0.5,
    nombre,
});

const CRISTAL_PLANTILLA = construir({
    id: "serie-cristal-liquido",
    nombre: "Cristal líquido",
    descripcion: "Círculos de cristal tintado con brillo especular: la identidad visual de StarSeed.",
    etiquetas: ["serie", "cristal", "identidad"],
    porDefecto: cristalLiquido(TRINITY.cyan, "Cristal · cian"),
    porFamilia: {
        comunicacion: cristalLiquido(TRINITY.magenta, "Cristal · comunicación"),
        conocimiento: cristalLiquido(TRINITY.cyan, "Cristal · conocimiento"),
        sistema: cristalLiquido(TRINITY.amber, "Cristal · sistema"),
        mundo: cristalLiquido(TRINITY.emerald, "Cristal · mundo"),
    },
});

/* ─────────────────────────── Flor de la vida ─────────────────────────── */

const flor = (desde: string, hasta: string, nombre: string): Parametros => ({
    forma: "flor",
    fondo: degradado(desde, hasta, 150),
    colorGlifo: "#fff7d6",
    escala: 0.5,
    brillo: 0.55,
    borde: { color: "#ffe9a8aa", ancho: 1.4 },
    nombre,
});

const FLOR_PLANTILLA = construir({
    id: "serie-flor-de-la-vida",
    nombre: "Flor de la vida",
    descripcion: "La silueta de seis pétalos de la geometría sagrada, en dorados, violetas y esmeraldas.",
    etiquetas: ["serie", "geometria", "dorado"],
    porDefecto: flor("#7c3aed", "#312e81", "Flor · violeta"),
    porFamilia: {
        comunicacion: flor("#c026d3", "#6d28d9", "Flor · comunicación"),
        conocimiento: flor("#7c3aed", "#1e3a8a", "Flor · conocimiento"),
        sistema: flor("#d97706", "#9a3412", "Flor · sistema"),
        mundo: flor("#059669", "#115e59", "Flor · mundo"),
    },
});

/* ─────────────────────────── Monocromo ─────────────────────────── */

const MONOCROMO_PLANTILLA = construir({
    id: "serie-monocromo",
    nombre: "Monocromo",
    descripcion: "Sin color: un cuadrado suave translúcido y glifos claros. Calma, contraste y lectura.",
    etiquetas: ["serie", "minimal", "alto-contraste"],
    porDefecto: {
        forma: "cuadrado-suave",
        fondo: { tipo: "color", color: "#ffffff14" },
        colorGlifo: "#e5e7eb",
        escala: 0.54,
        brillo: 0,
        borde: { color: "#ffffff40", ancho: 1.2 },
        nombre: "Monocromo",
    },
});

/* ─────────────────────────── Catálogo ─────────────────────────── */

export const PLANTILLAS_SERIE: readonly PlantillaIconos[] = Object.freeze([
    TRINITY_PLANTILLA,
    CRISTAL_PLANTILLA,
    FLOR_PLANTILLA,
    MONOCROMO_PLANTILLA,
]);

export function plantillaDeSerie(id: string): PlantillaIconos | null {
    return PLANTILLAS_SERIE.find((p) => p.id === id) ?? null;
}

export function esPlantillaDeSerie(id: string | null | undefined): boolean {
    return !!id && PLANTILLAS_SERIE.some((p) => p.id === id);
}

export { FAMILIAS };
