/**
 * Variaciones creativas por contexto — Ola 304 · Tarea zU4.
 *
 * Módulo PURO y DETERMINISTA: misma entrada → misma salida SIEMPRE. La interfaz
 * cambia con el tema, la hora y lo que estás haciendo, pero de forma noble y
 * estable: si parpadeara en cada render sería un mareo, no un diseño vivo.
 * El resultado encaja tal cual en `AppearanceConfig.background.living`.
 *
 * NADA de `Math.random()`, `Date.now()` ni `window` dentro de estas funciones:
 * todo entra por parámetro, o el test no puede existir.
 */

import type { CuratedPresetMood } from "@/lib/themes/curated-presets";

/** Variantes visuales creativas que soporta el fondo «living». */
export type VarianteVisual =
    | "aurora"
    | "nebula"
    | "starfield"
    | "mycelium"
    | "plasma"
    | "prisma"
    | "ocean";

/** Información de contexto que condiciona la variación. Pura y seriada. */
export interface ContextoVisual {
    /** Ruta o área del OS («/network/politics», «biblioteca», «perfil»…). */
    area: string;
    /** Tema activo (opcional). */
    tema?: CuratedPresetMood;
    /** Hora local (0–24). Modula temperatura y brillo. */
    horaLocal: number;
    /** Cuánto contenido hay en pantalla. */
    densidadInformacion: "baja" | "media" | "alta";
    /** Preferencia de accesibilidad por movimiento reducido. */
    movimientoReducido: boolean;
    /** Dispositivo modesto (economía de recursos). */
    dispositivoModesto: boolean;
    /** Semilla estable (id de perfil, por ejemplo) para desempatar. */
    semilla?: string;
}

/** Variación visual resuelta, lista para `AppearanceConfig.background.living`. */
export interface VariacionVisual {
    variante: VarianteVisual;
    /** Velocidad 0–2. 0 = sin movimiento. */
    velocidad: number;
    /** Intensidad/densidad 0–1. */
    intensidad: number;
    /** Rotación automática de variantes cada N segundos (0 = off). */
    cicloSegundos: number;
    /** Paleta (hex). Si vacío, usa los acentos del tema activo. */
    acentos: string[];
    /** Explica la elección en español, para que la interfaz pueda enseñarlo. */
    motivo: string;
}

/** Configuración base (velocidad, intensidad y acentos) de cada variante. */
interface CatalogoVariante {
    velocidad: number;
    intensidad: number;
    acentos: string[];
    descripcion: string;
}

/** Catálogo de las siete variantes con sus valores por defecto. */
const CATALOGO: Record<VarianteVisual, CatalogoVariante> = {
    prisma: {
        velocidad: 0.6,
        intensidad: 0.45,
        acentos: ["#007FFF", "#FFBF00", "#10B981"],
        descripcion: "prisma geométrico, sobrio y estructurado",
    },
    starfield: {
        velocidad: 0.9,
        intensidad: 0.5,
        acentos: ["#0A0E27", "#A5F3FC", "#67E8F9"],
        descripcion: "campo estelar claro y legible",
    },
    nebula: {
        velocidad: 0.7,
        intensidad: 0.6,
        acentos: ["#0d0221", "#A855F7", "#41EAD4"],
        descripcion: "nebulosa profunda y envolvente",
    },
    mycelium: {
        velocidad: 0.75,
        intensidad: 0.6,
        acentos: ["#1a2e1a", "#7d9b76", "#FDE047"],
        descripcion: "micelio orgánico que crece y respira",
    },
    aurora: {
        velocidad: 0.5,
        intensidad: 0.7,
        acentos: ["#0a0e27", "#10B981", "#A855F7"],
        descripcion: "aurora fluida y orgánica",
    },
    plasma: {
        velocidad: 1.2,
        intensidad: 0.8,
        acentos: ["#FF3CAC", "#784BA0", "#00F0FF"],
        descripcion: "plasma eléctrico y vibrante",
    },
    ocean: {
        velocidad: 0.55,
        intensidad: 0.55,
        acentos: ["#0c4a6e", "#06B6D4", "#A5F3FC"],
        descripcion: "océano sereno y calmado",
    },
};

/** Familias visuales → lista de variantes candidatas (la semilla desempata). */
const FAMILIAS: Record<string, VarianteVisual[]> = {
    prisma: ["prisma", "starfield", "nebula"],
    mycelium: ["mycelium", "aurora", "ocean"],
    ocean: ["ocean", "nebula", "aurora"],
    nebula: ["nebula", "prisma", "ocean"],
    starfield: ["starfield", "aurora", "prisma"],
    aurora: ["aurora", "mycelium", "plasma"],
    plasma: ["plasma", "aurora", "nebula"],
};

/** Familia por defecto cuando ni el área ni el tema la deciden. */
const FAMILIA_DEFECTO = "aurora";

/**
 * Hash pequeño y estable escrito a mano, sin mutar el estado compartido.
 * La misma semilla en la misma familia produce siempre la misma variante.
 */
function desempateSemilla(semilla: string, mod: number): number {
    let h = 0;
    for (let i = 0; i < semilla.length; i += 1) {
        h = (h * 31 + semilla.charCodeAt(i)) >>> 0;
    }
    return h % mod;
}

/** Clasifica el área del OS en una familia visual con criterio. */
function familiaPorArea(area: string): string | null {
    const a = area.toLowerCase();
    if (
        a.includes("politic") || a.includes("gobernan") || a.includes("hub") ||
        a.includes("vot") || a.includes("asamble") || a.includes("mando") ||
        a.includes("sistema") || a.includes("gesti")
    ) {
        return "prisma";
    }
    if (
        a.includes("cultura") || a.includes("arte") || a.includes("public") ||
        a.includes("crear") || a.includes("multiverso")
    ) {
        return "mycelium";
    }
    if (
        a.includes("bibliotec") || a.includes("library") || a.includes("leer") ||
        a.includes("document")
    ) {
        return "ocean";
    }
    if (
        a.includes("educacion") || a.includes("education") || a.includes("aprend") ||
        a.includes("curs") || a.includes("clases")
    ) {
        return "starfield";
    }
    if (a.includes("perfil") || a.includes("profile")) {
        return "aurora";
    }
    if (a.includes("red") || a.includes("explorer") || a.includes("network")) {
        return "nebula";
    }
    return null;
}

/** El tema puede sugerir una familia visual autónoma (sin área). */
function familiaPorTema(tema?: CuratedPresetMood): string | null {
    switch (tema) {
        case "cyberdelico": return "plasma";
        case "solarpunk":
        case "organico": return "mycelium";
        case "luxury": return "nebula";
        case "minimal":
        case "brutalist": return "prisma";
        case "futurista": return "starfield";
        default: return null;
    }
}

/** Normaliza la hora local a un rango 0–24 estable. */
function horaNormalizada(hora: number): number {
    const h = hora % 24;
    return h < 0 ? h + 24 : h;
}

/** Recorta un número a un rango [min, max]. */
function recortar(valor: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, valor));
}

/**
 * Resuelve la variación visual para un contexto dado. Determinista: la misma
 * entrada produce siempre el mismo objeto. Encaja en
 * `AppearanceConfig.background.living` (variante → variant, velocidad → speed,
 * intensidad → intensity, cicloSegundos → autoCycleSec, acentos → colors).
 */
export function variacionPara(ctx: ContextoVisual): VariacionVisual {
    const familia =
        familiaPorArea(ctx.area) ??
        familiaPorTema(ctx.tema) ??
        FAMILIA_DEFECTO;

    const candidatas = FAMILIAS[familia] ?? FAMILIAS[FAMILIA_DEFECTO];
    const variante =
        ctx.semilla && ctx.semilla.length > 0
            ? candidatas[desempateSemilla(ctx.semilla, candidatas.length) % candidatas.length]
            : candidatas[0];

    const base = CATALOGO[variante];
    const acentos = [...base.acentos];
    const motivos: string[] = [base.descripcion];

    // La hora modula el brillo y el ritmo: de noche, más oscuro y más lento.
    const hora = horaNormalizada(ctx.horaLocal);
    const esNoche = hora < 7 || hora >= 21;
    const esAmanecerOAnochecer = hora >= 7 && hora < 9;
    let velocidad = base.velocidad;
    let intensidad = base.intensidad;
    if (esNoche) {
        velocidad *= 0.6;
        intensidad *= 0.75;
        motivos.push("atenúa el brillo y el ritmo con la noche");
    } else if (esAmanecerOAnochecer) {
        velocidad *= 0.85;
        motivos.push("suaviza la transición del día");
    }

    // Mucha información: el fondo se aparta para no competir con la lectura.
    if (ctx.densidadInformacion === "alta") {
        velocidad *= 0.6;
        intensidad *= 0.6;
        motivos.push("cede protagonismo a la alta densidad de contenido");
    }

    let cicloSegundos = ctx.movimientoReducido || ctx.dispositivoModesto ? 0 : 42;

    // Dispositivo modesto: economía de recursos, intensidad contenida.
    if (ctx.dispositivoModesto) {
        intensidad = recortar(intensidad, 0, 0.4);
        motivos.push("economiza recursos en un dispositivo modesto");
    }

    // Accesibilidad: el movimiento reducido manda sobre todo lo demás.
    if (ctx.movimientoReducido) {
        velocidad = 0;
        cicloSegundos = 0;
        motivos.push("movimiento desactivado por accesibilidad");
    }

    return {
        variante,
        velocidad: recortar(velocidad, 0, 2),
        intensidad: recortar(intensidad, 0, 1),
        cicloSegundos,
        acentos,
        motivo: motivos.join(" · "),
    };
}