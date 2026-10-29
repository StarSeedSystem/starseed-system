/**
 * BIBLIOTECA DE MOVIMIENTO STARSEED — WAAPI, puro (Ola 1019D · DSN1019G)
 * ─────────────────────────────────────────────────────────────────────────────
 * Fotogramas y opciones listos para `elemento.animate(...)`. Módulo PURO: no toca
 * DOM, red ni disco. Rehace `transiciones.html` y `siembra.html` con los tokens
 * del ADN y solo `transform`, `opacity`, `filter` y `clipPath`; cada gesto tiene
 * su versión reducida.
 */
const ORGANICA = "cubic-bezier(0.22, 1, 0.36, 1)";
const DESLIZ = "cubic-bezier(0.16, 1, 0.3, 1)";
const GENESIS = "cubic-bezier(0.22, 0.9, 0.3, 1)";
/** Curvas reales del OS (§5 de `adn-y-tokens.md`). */
export const CURVA_STARSEED = { organica: ORGANICA, desliz: DESLIZ, genesis: GENESIS } as const;
/** Duraciones de interfaz (140/220/240 ms) y de escena (600–900 ms); respiración 5 s. */
export const DURACION_STARSEED = {
    rapida: 140, organica: 220, normal: 240,
    fundido: 600, compartido: 640, barrido: 700, cardinal: 720,
    cristalizacion: 800, alquimia: 880, siembra: 900, respiracion: 5000,
} as const;
export const PROPIEDADES_PERMITIDAS = ["transform", "opacity", "filter", "clipPath"] as const;
export type NombreMovimiento =
    | "siembra" | "entrada-cardinal" | "fundido-desenfoque" | "elemento-compartido"
    | "barrido-horizonte" | "respiracion" | "cristalizacion" | "alquimia";

/** Punto de la Trinity desde el que entra un elemento (guía, creación, control, raíz). */
export type PuntoTrinity = "guia" | "creacion" | "control" | "raiz";

export interface FotogramaStarseed {
    transform?: string;
    opacity?: number;
    filter?: string;
    clipPath?: string;
    offset?: number;
}

export interface OpcionesStarseed {
    duration: number;
    easing: string;
    fill: "none" | "forwards" | "backwards" | "both";
    delay?: number;
    iterations?: number;
    direction?: "normal" | "reverse" | "alternate" | "alternate-reverse";
}

export interface MovimientoStarseed {
    nombre: NombreMovimiento;
    fotogramas: FotogramaStarseed[];
    opciones: OpcionesStarseed;
}

/** 24 px de recorrido desde el borde de cada punto de la Trinity. */
const ENTRADA_POR_PUNTO: Record<PuntoTrinity, string> = {
    guia: "translateY(-24px) scale(0.98)",
    creacion: "translateX(-24px) scale(0.98)",
    control: "translateX(24px) scale(0.98)",
    raiz: "translateY(24px) scale(0.98)",
};

/** Fotogramas y opciones de cada gesto (la entrada cardinal se construye aparte). */
type Definicion = { fotogramas: FotogramaStarseed[]; opciones: OpcionesStarseed };
const DEFINICIONES: Record<Exclude<NombreMovimiento, "entrada-cardinal">, Definicion> = {
    siembra: { fotogramas: [{ transform: "scale(0)", opacity: 0 }, { transform: "scale(1.2)", opacity: 1, offset: 0.6 }, { transform: "none", opacity: 1 }], opciones: { duration: DURACION_STARSEED.siembra, easing: ORGANICA, fill: "both" } },
    "fundido-desenfoque": { fotogramas: [{ filter: "blur(8px)", opacity: 0 }, { filter: "blur(0px)", opacity: 1 }], opciones: { duration: DURACION_STARSEED.fundido, easing: ORGANICA, fill: "both" } },
    "elemento-compartido": { fotogramas: [{ transform: "scale(1)" }, { transform: "scale(2.6, 3.2)" }], opciones: { duration: DURACION_STARSEED.compartido, easing: DESLIZ, fill: "both", iterations: 2, direction: "alternate" } },
    "barrido-horizonte": { fotogramas: [{ clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0 0 0)" }], opciones: { duration: DURACION_STARSEED.barrido, easing: DESLIZ, fill: "both", delay: 300 } },
    respiracion: { fotogramas: [{ transform: "scale(1)" }, { transform: "scale(1.03)" }], opciones: { duration: DURACION_STARSEED.respiracion, easing: ORGANICA, fill: "both", iterations: Infinity, direction: "alternate" } },
    cristalizacion: { fotogramas: [{ transform: "scale(1.12) rotate(-4deg)", opacity: 0 }, { transform: "none", opacity: 1 }], opciones: { duration: DURACION_STARSEED.cristalizacion, easing: DESLIZ, fill: "both" } },
    alquimia: { fotogramas: [{ filter: "grayscale(1) saturate(0.4) brightness(0.85)", transform: "scale(0.96)" }, { filter: "grayscale(0) saturate(1) brightness(1)", transform: "none" }], opciones: { duration: DURACION_STARSEED.alquimia, easing: ORGANICA, fill: "both" } },
};

/** Entrada cardinal: desde el borde de su punto de la Trinity hacia el centro. */
export function entradaCardinal(punto: PuntoTrinity = "raiz"): MovimientoStarseed {
    return {
        nombre: "entrada-cardinal",
        fotogramas: [
            { transform: ENTRADA_POR_PUNTO[punto], opacity: 0 },
            { transform: "translateY(-2px)", opacity: 1, offset: 0.8 },
            { transform: "none", opacity: 1 },
        ],
        opciones: { duration: DURACION_STARSEED.cardinal, easing: DESLIZ, fill: "both" },
    };
}

/** Un movimiento por nombre; la entrada cardinal recibe su punto de la Trinity. */
export function movimientoStarseed(nombre: NombreMovimiento, punto: PuntoTrinity = "raiz"): MovimientoStarseed {
    if (nombre === "entrada-cardinal") return entradaCardinal(punto);
    const d = DEFINICIONES[nombre];
    return { nombre, fotogramas: d.fotogramas.map((f) => ({ ...f })), opciones: { ...d.opciones } };
}

/** Solo opacity: el estado final se pinta sin desplazamiento ni desenfoque. */
export function fotogramasReducidos(fotogramas: FotogramaStarseed[]): FotogramaStarseed[] {
    return fotogramas.map((f) => ({ opacity: f.opacity ?? 1 }));
}

/** Opciones de movimiento reducido: 1 ms, sin retardo, una sola pasada. */
export function opcionesReducidas(
    opciones: OpcionesStarseed = { duration: DURACION_STARSEED.organica, easing: ORGANICA, fill: "both" },
): OpcionesStarseed {
    return { ...opciones, duration: 1, delay: 0, iterations: 1, direction: "normal" };
}

/** La misma identidad de gesto, reducida: fundido simple sin movimiento. */
export function movimientoReducido(nombre: NombreMovimiento, punto: PuntoTrinity = "raiz"): MovimientoStarseed {
    const m = movimientoStarseed(nombre, punto);
    return { nombre, fotogramas: fotogramasReducidos(m.fotogramas), opciones: opcionesReducidas(m.opciones) };
}

/** Propiedades que anima un conjunto de fotogramas (sin contar `offset`). */
export function propiedadesDe(fotogramas: FotogramaStarseed[]): string[] {
    const vistas = new Set<string>();
    for (const f of fotogramas) for (const clave of Object.keys(f)) if (clave !== "offset") vistas.add(clave);
    return [...vistas];
}

/** Guardia de la casa: true si solo se animan las cuatro propiedades permitidas. */
export function soloPropiedadesPermitidas(fotogramas: FotogramaStarseed[]): boolean {
    const permitidas: readonly string[] = PROPIEDADES_PERMITIDAS;
    return propiedadesDe(fotogramas).every((p) => permitidas.includes(p));
}
