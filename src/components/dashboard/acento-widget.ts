/**
 * ACENTO DE WIDGET — carácter por categoría sin romper la unidad (Ola 305 · zW6)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un widget de gobernanza y uno de arte no pueden sentirse idénticos; pero las
 * 29 categorías tampoco pueden convertirse en 29 estilos sueltos. Este módulo
 * es la ÚNICA fuente de esa variación: cada categoría recibe un acento (color,
 * color suave, borde), un carácter de MOVIMIENTO y una DENSIDAD. Todo lo demás
 * —marco, estados, tipografía— sigue siendo común a todos los widgets.
 *
 * Módulo PURO y DETERMINISTA: sin `Math.random`, sin `Date.now`, sin `window`,
 * sin red ni disco. Todo entra por parámetro, así que se puede probar entero.
 *
 * Los colores NO son una paleta nueva: son exactamente los tokens que ya declara
 * `widget-categories.ts` para cada categoría, expresados como utilidades Tailwind
 * (texto / relleno tenue / borde). Las duraciones salen de `DURACION`, la escala
 * única del OS en `src/lib/design/movimiento.ts` (150-300 ms, CLAUDE.md §8).
 */

import { DURACION } from "@/lib/design/movimiento";

/** Carácter del movimiento de una familia de widgets. */
export type MovimientoAcento = "sobrio" | "vivo" | "organico";

/** Densidad de espaciado que el marco aplica al contenido. */
export type DensidadAcento = "compacta" | "comoda";

/** Acento completo de una categoría: color, carácter y densidad. */
export interface AcentoWidget {
    /** Color del acento como utilidad de texto (p. ej. `text-orange-500`). */
    color: string;
    /** Relleno tenue del mismo acento, para fondos y píldoras. */
    colorSuave: string;
    /** Borde del mismo acento, para separadores y contornos. */
    borde: string;
    /** Cómo se mueve la familia: sobrio, vivo u orgánico. */
    movimiento: MovimientoAcento;
    /** Cuánto respira el contenido: compacta o cómoda. */
    densidad: DensidadAcento;
}

/** Tiempos de animación resueltos para un acento. */
export interface RitmoWidget {
    /** Duración de la transición en milisegundos. */
    duracionMs: number;
    /** Retardo entre elementos de una lista, en milisegundos. */
    escalonMs: number;
}

/**
 * Acento neutro del sistema. Se devuelve ante una categoría desconocida: un
 * widget nuevo o mal etiquetado se ve discreto y correcto, nunca reventado.
 * Usa los tokens neutros del design system (`muted` / `border`), no un color.
 */
const NEUTRO: AcentoWidget = {
    color: "text-muted-foreground",
    colorSuave: "bg-muted/40",
    borde: "border-border/40",
    movimiento: "sobrio",
    densidad: "comoda",
};

/**
 * Construye el trío de utilidades a partir del token de color que la categoría
 * YA declara en `widget-categories.ts` (`color: "orange-500"`, etc.). Las
 * opacidades (10 % de relleno, 30 % de borde) son las que el marco de widgets
 * usa hoy para sus contornos: no se inventa CSS nuevo.
 */
function conToken(
    token: string,
    movimiento: MovimientoAcento,
    densidad: DensidadAcento,
): AcentoWidget {
    return {
        color: `text-${token}`,
        colorSuave: `bg-${token}/10`,
        borde: `border-${token}/30`,
        movimiento,
        densidad,
    };
}

/**
 * Un acento por categoría. El criterio, en voz alta:
 *
 *  · GOBERNANZA (política, parlamento) → **sobria**. La decisión colectiva no
 *    debe parecer un juguete: se mueve poco y deja leer, con densidad cómoda.
 *  · CULTURA, ARTE, CREATIVIDAD, ASTROLOGÍA → **orgánicas**. Lo expresivo
 *    respira: tiempos largos y cascadas suaves, aire alrededor del contenido.
 *  · IA y CIBERDELIA → **vivas**. Son la piel eléctrica del OS; ahí el
 *    dinamismo es el mensaje.
 *  · SISTEMA, PRIVACIDAD, DISPOSITIVOS, RED → **sobrios y compactos**. Son
 *    instrumentos: muchos datos por centímetro y ningún adorno que distraiga
 *    de un estado crítico.
 *  · CLIMA y ASTRONOMÍA → **vivos y cómodos**. El cielo cambia solo; el widget
 *    lo acompaña, con sitio para que el dato ambiental se lea de un vistazo.
 *  · El resto se reparte entre esos cinco caracteres según si su trabajo es
 *    medir (sobrio/compacto), convivir (vivo/cómodo) o expresar (orgánico).
 */
const ACENTOS: Record<string, AcentoWidget> = {
    // ── Instrumentos: miden, vigilan, guardan. Sobrios y compactos. ──────
    sistema: conToken("teal-500", "sobrio", "compacta"),
    privacidad: conToken("violet-400", "sobrio", "compacta"),
    dispositivos: conToken("amber-400", "sobrio", "compacta"),
    red: conToken("blue-400", "sobrio", "compacta"),
    economia: conToken("emerald-500", "sobrio", "compacta"),
    productividad: conToken("violet-500", "sobrio", "compacta"),
    archivos: conToken("yellow-600", "sobrio", "compacta"),
    utilidades: conToken("amber-500", "sobrio", "compacta"),
    aplicaciones: conToken("lime-400", "sobrio", "compacta"),

    // ── Deliberación: gobernanza y aprendizaje. Sobrios, pero cómodos. ───
    politica: conToken("orange-500", "sobrio", "comoda"),
    parlamento: conToken("stone-500", "sobrio", "comoda"),
    educacion: conToken("purple-500", "sobrio", "comoda"),
    ayudantia: conToken("green-500", "sobrio", "comoda"),

    // ── Piel eléctrica y ambiente cambiante. Vivos y cómodos. ────────────
    ia: conToken("cyan-400", "vivo", "comoda"),
    ciberdelia: conToken("purple-400", "vivo", "comoda"),
    clima: conToken("sky-500", "vivo", "comoda"),
    astronomia: conToken("indigo-500", "vivo", "comoda"),
    personalizacion: conToken("cyan-500", "vivo", "comoda"),
    entretenimiento: conToken("lime-500", "vivo", "comoda"),
    social: conToken("blue-500", "vivo", "comoda"),
    sociedad: conToken("emerald-400", "vivo", "comoda"),
    explorador: conToken("orange-400", "vivo", "comoda"),

    // ── Expresión y hallazgo: lo que emerge. Orgánicos y cómodos. ────────
    cultura: conToken("pink-500", "organico", "comoda"),
    arte: conToken("fuchsia-500", "organico", "comoda"),
    creatividad: conToken("pink-400", "organico", "comoda"),
    astrologia: conToken("rose-400", "organico", "comoda"),
    descubrimientos: conToken("yellow-500", "organico", "comoda"),
    ubicacion: conToken("red-500", "organico", "comoda"),
    perfil: conToken("cyan-400", "organico", "comoda"),
};

/**
 * Acento de una categoría. Una categoría desconocida devuelve el neutro del
 * sistema; jamás lanza: un widget mal etiquetado se ve discreto, no roto.
 * Devuelve una copia, así que quien lo reciba no puede corromper la tabla.
 */
export function acentoDe(categoria: string): AcentoWidget {
    const encontrado = ACENTOS[categoria];
    return encontrado ? { ...encontrado } : { ...NEUTRO };
}

/**
 * Tiempos por carácter de movimiento, dentro de la escala del OS:
 *  · sobrio   — `rapido` (150 ms) y SIN cascada: el instrumento aparece entero.
 *  · vivo     — `normal` (220 ms) con el escalón estándar de listas (40 ms).
 *  · organico — `pausado` (300 ms) con un escalón más largo (60 ms), como algo
 *               que crece por partes.
 */
const RITMOS: Record<MovimientoAcento, RitmoWidget> = {
    sobrio: { duracionMs: DURACION.rapido, escalonMs: 0 },
    vivo: { duracionMs: DURACION.normal, escalonMs: 40 },
    organico: { duracionMs: DURACION.pausado, escalonMs: 60 },
};

/**
 * Traduce el carácter de movimiento a tiempos concretos.
 * Con `movimientoReducido` TODO va a 0 —duración y escalón, sin excepción—:
 * es accesibilidad, no gusto. El estado final se aplica de golpe.
 */
export function ritmoDe(a: AcentoWidget, movimientoReducido: boolean): RitmoWidget {
    if (movimientoReducido) return { duracionMs: 0, escalonMs: 0 };
    return { ...RITMOS[a.movimiento] };
}

/** Clases de espaciado por densidad, las mismas que ya aplica el marco. */
const DENSIDADES: Record<DensidadAcento, string> = {
    compacta: "gap-1.5 p-2",
    comoda: "gap-2 p-3",
};

/**
 * Clases de espaciado que el marco aplica al cuerpo del widget. Son utilidades
 * que el sistema ya usa (`p-3 gap-2` en `kit/marco-widget.tsx`): aquí solo se
 * elige entre las dos densidades, no se inventa CSS nuevo.
 */
export function claseDeDensidad(a: AcentoWidget): string {
    return DENSIDADES[a.densidad];
}
