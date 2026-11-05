// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS · Referencias de diseño · MotionSites (Ola 1104R)
// ------------------------------------------------------------------------------
// Técnicas y rúbrica del repo Motionsites-AI/claude-skill, resumidas con
// palabras propias y enlazadas a su receta original. No se copian prompts,
// medios ni párrafos: el enlace es la referencia (MIT en código e indicaciones;
// prompts y medios © MotionSites).
//
// Módulo PURO, sin "use client" y sin `node:*`: lo importan los agentes
// diseñadores que generan publicaciones, páginas de grupos y comunidades,
// fichas de la Librería y el lienzo universal (contrato §5).
// ════════════════════════════════════════════════════════════════════════════

import datos from "../../../../config/referencias-diseno/motionsites.json";

/** Una receta de técnica: qué es, cuándo conviene y dónde leerla en el repo. */
export interface Tecnica {
    id: string;
    nombre: string;
    cuandoUsarla: string;
    enlace: string;
}

/** Una pregunta de la rúbrica de revisión visual, en forma de lista de comprobación. */
export interface PreguntaRubrica {
    id: string;
    pregunta: string;
}

/** Los contextos de StarSeed OS donde se generan páginas con estas referencias. */
export type TipoDePagina =
    | "publicacion"
    | "grupo"
    | "comunidad"
    | "ficha-libreria"
    | "lienzo"
    | "landing";

interface DatosMotionSites {
    repo: string;
    fuente: string;
    licencia: string;
    nota: string;
    tecnicas: Tecnica[];
    rubrica: PreguntaRubrica[];
}

const DATOS = datos as DatosMotionSites;

/** Repo de origen, para trazabilidad y para no confundirlo con una dependencia. */
export const REPO_MOTIONSITES = DATOS.repo;
/** Enlace canónico al repo de MotionSites. */
export const FUENTE_MOTIONSITES = DATOS.fuente;
/** Licencia real: código e indicaciones MIT; prompts y medios © MotionSites. */
export const LICENCIA_MOTIONSITES = DATOS.licencia;
/** Las 58 recetas, tal cual vienen del JSON. */
export const TECNICAS: readonly Tecnica[] = DATOS.tecnicas;
/** La rúbrica de diez preguntas para revisar una página ya construida. */
export const RUBRICA: readonly PreguntaRubrica[] = DATOS.rubrica;

/** Orden estable de los tipos de página que entiende `tecnicasPara`. */
export const TIPOS_DE_PAGINA: readonly TipoDePagina[] = [
    "publicacion",
    "grupo",
    "comunidad",
    "ficha-libreria",
    "lienzo",
    "landing",
];

const POR_TIPO: Readonly<Record<TipoDePagina, readonly string[]>> = {
    publicacion: [
        "entrada-escalonada-desenfoque", "titular-palabra-a-palabra", "acento-serif-cursiva",
        "revelado-texto-por-scroll", "tipografia-gigante-imagen", "revelado-escalonado-viewport",
    ],
    grupo: [
        "anillos-orbita-avatares", "grupo-avatares-confianza", "navegacion-pildora-flotante",
        "menu-movil", "revelado-escalonado-viewport", "marquesina-infinita",
    ],
    comunidad: [
        "anillos-orbita-avatares", "grupo-avatares-confianza", "marquesina-infinita",
        "carrusel-tarjetas-infinito", "contador-cifras-preloader", "chips-seleccionables",
    ],
    "ficha-libreria": [
        "hover-tarjeta-media", "texturas-grano-tramado", "superficie-cristal-liquido",
        "kit-cristal-esmerilado", "maqueta-producto-en-pagina", "rejilla-a-carrusel-movil",
    ],
    lienzo: [
        "hero-modelo-3d", "fondo-shader-animado", "iman-hover",
        "paralaje-capas-puntero", "mascara-foco-cursor", "escenario-cinematico-fijo",
    ],
    landing: [
        "video-fondo-cinematico", "velo-borde-fundido", "superficie-cristal-liquido",
        "entrada-escalonada-desenfoque", "titular-palabra-a-palabra", "hero-modelo-3d",
    ],
};

const INDICE = new Map(TECNICAS.map((t) => [t.id, t]));

/** Las técnicas recomendadas para un tipo de página, en el orden del catálogo. */
export function tecnicasPara(tipoDePagina: TipoDePagina): readonly Tecnica[] {
    const ids = POR_TIPO[tipoDePagina] ?? [];
    return ids
        .map((id) => INDICE.get(id))
        .filter((t): t is Tecnica => t !== undefined);
}
