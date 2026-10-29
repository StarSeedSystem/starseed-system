// Bloque «protomolecula» del lienzo universal: serializa una MOLÉCULA del núcleo
// (`./tipos`) a un texto JSON versionado para incrustarlo en `ss:meta` de os_posts.
// Módulo PURO: sin red, sin disco, sin `node:*`. Contrato: `architecture/protomolecula.md`.
import { AMBITOS } from "./tipos";
import type { Ambito, AtomoEnUso, Capa, Molecula } from "./tipos";
import { referenciasRotas } from "./permisos";

/** Qué vista mostrar para el átomo «video-html». */
export type VistaVideoHtml = "poster" | "video" | "preview";

/** Parámetros para decidir la vista del vídeo. */
export interface ElegirVistaArgs {
    /** Átomo en uso (contiene `herramientaId` y `id`). */
    atomo: AtomoEnUso;
    /** Si el servicio local (HyperFrames) está vivo y responde. */
    servicioVivo: boolean;
    /** Si el render ya terminó y hay un archivo de vídeo listo. */
    renderHecho: boolean;
}

/**
 * Decide qué vista mostrar para el átomo «video-html».
 * - Si `renderHecho` → «video» (el vídeo renderizado).
 * - Sino si `servicioVivo` → «preview» (vista previa en vivo del servicio).
 * - Sino → «poster» (imagen estática / póster).
 */
export function elegirVista({ atomo, servicioVivo, renderHecho }: ElegirVistaArgs): VistaVideoHtml {
    if (atomo.herramientaId !== "hyperframes" && atomo.herramientaId !== "video-html") {
        return "poster";
    }
    if (renderHecho) return "video";
    if (servicioVivo) return "preview";
    return "poster";
}

/** Versión del sobre JSON del bloque. */
export const VERSION_BLOQUE = 1;
/** Tope del bloque serializado (deja margen dentro de MAX_SS_META_BYTES). */
export const MAX_BLOQUE_BYTES = 32 * 1024;

type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };
const texto = (x: unknown): x is string => typeof x === "string" && x.length > 0;
const numero = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

const COMPUTO: readonly string[] = ["navegador", "app-nativa", "neurona-nas", "neurona-procesador", "oracle-a1", "nube"];

function esCapaValida(c: unknown): c is Capa {
    if (typeof c !== "object" || c === null) return false;
    const capa = c as Capa;
    if (!texto(capa.id) || !texto(capa.tipo) || !texto(capa.titulo) || !texto(capa.formato)) return false;
    if (capa.referencia !== null && (!texto(capa.referencia.tipo) || !texto(capa.referencia.id))) return false;
    return numero(capa.orden) && typeof capa.visible === "boolean" && typeof capa.bloqueada === "boolean";
}

function esAtomoValido(a: unknown): a is AtomoEnUso {
    if (typeof a !== "object" || a === null) return false;
    const at = a as AtomoEnUso;
    if (!texto(at.id) || !texto(at.herramientaId)) return false;
    if (at.capaId !== undefined && !texto(at.capaId)) return false;
    if (at.titulo !== undefined && !texto(at.titulo)) return false;
    if (at.ejecutaEn !== undefined && !COMPUTO.includes(at.ejecutaEn)) return false;
    return at.estado === "activo" || at.estado === "suspendido";
}

/**
 * Validación estricta de una molécula del NÚCLEO (`tipos.ts`). No reutiliza
 * `esMoleculaValida` de `./almacen-moleculas` porque ése valida la forma ANTIGUA
 * de `molecula-estado-tipos.ts` (otros ámbitos y otra forma de capas/átomos);
 * aquí se exige la forma del contrato §11.1. Nunca lanza.
 */
export function esMoleculaValidaNucleo(x: unknown): x is Molecula {
    if (typeof x !== "object" || x === null || Array.isArray(x)) return false;
    const m = x as Molecula;
    if (!texto(m.id) || typeof m.titulo !== "string") return false;
    if (!AMBITOS.includes(m.ambito)) return false;
    if (!Array.isArray(m.capas) || !m.capas.every(esCapaValida)) return false;
    if (!Array.isArray(m.atomos) || !m.atomos.every(esAtomoValido)) return false;
    if (typeof m.valores !== "object" || m.valores === null || Array.isArray(m.valores)) return false;
    if (!Object.values(m.valores).every((v) => typeof v === "number" || typeof v === "boolean" || typeof v === "string")) return false;
    return numero(m.version) && numero(m.creadaEn) && numero(m.actualizadaEn);
}

/**
 * Serializa la molécula a `{pm: 1, molecula}` para viajar en `ss:meta`. Solo
 * viajan capas con SU referencia (la molécula cita, nunca copia), los átomos y
 * los valores: nada de datos de otras personas ni de salud. ≤ 32 KB.
 */
export function serializarBloque(m: Molecula): Resultado<string> {
    if (!esMoleculaValidaNucleo(m)) return { ok: false, motivo: "molécula inválida" };
    let json: string;
    try {
        json = JSON.stringify({ pm: VERSION_BLOQUE, molecula: m });
    } catch {
        return { ok: false, motivo: "no se pudo serializar la molécula" };
    }
    const bytes = new TextEncoder().encode(json).length;
    if (bytes > MAX_BLOQUE_BYTES) return { ok: false, motivo: `tamaño excedido: ${bytes} bytes, límite ${MAX_BLOQUE_BYTES}` };
    return { ok: true, valor: json };
}

/** Lee el bloque con validación estricta. Nunca lanza: JSON basura → {ok:false}. */
export function leerBloque(textoBloque: string): Resultado<Molecula> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(textoBloque);
    } catch {
        return { ok: false, motivo: "JSON no válido" };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return { ok: false, motivo: "estructura no esperada" };
    const pm = (parsed as { pm?: unknown }).pm;
    const molecula = (parsed as { molecula?: unknown }).molecula;
    if (pm !== VERSION_BLOQUE) return { ok: false, motivo: `versión no soportada: ${String(pm)}` };
    if (!esMoleculaValidaNucleo(molecula)) return { ok: false, motivo: "molécula inválida" };
    return { ok: true, valor: molecula };
}

/**
 * Avisos de publicación (frases en español) al poner una molécula en un post de
 * ámbito `ambitoPost`: si la molécula es más reservada que la publicación y las
 * capas que citan entidades más reservadas (vía `referenciasRotas` de
 * `./permisos`). El bloque es una INSTANTÁNEA: quien lo vea tendrá una copia,
 * no la original.
 */
export function avisosDePublicacion(m: Molecula, ambitoPost: Ambito, ambitoDe: (tipo: string, id: string) => Ambito): string[] {
    const avisos: string[] = [];
    if (AMBITOS.indexOf(m.ambito) < AMBITOS.indexOf(ambitoPost)) {
        avisos.push(`La molécula es más reservada (${m.ambito}) que la publicación (${ambitoPost}).`);
    }
    const rotas = new Set(referenciasRotas(m.capas, ambitoPost, ambitoDe));
    for (const capa of m.capas) {
        if (!rotas.has(capa.id) || !capa.referencia) continue;
        const ambitoRef = ambitoDe(capa.referencia.tipo, capa.referencia.id);
        avisos.push(`La capa "${capa.titulo}" cita una entidad más reservada (${ambitoRef}) que la publicación (${ambitoPost}).`);
    }
    if (avisos.length > 0) avisos.push("El bloque es una instantánea: quien lo vea tendrá una copia, no la original.");
    return avisos;
}
