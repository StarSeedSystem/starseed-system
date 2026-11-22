/**
 * Hilo único de dirección cross-media (GEN1113 §10).
 *
 * Unifica lo que llega por los cuatro canales de la dirección —Astraura › Chat › Genesis
 * (`direccion`), el bot de Hermes (`puente:hermes-avisos`), las peticiones del A1
 * (`puente:peticiones`) y los avisos de los directores (`puente:avisos-directores`)— en UNA
 * sola lista ordenada por hora, sin duplicados por `id`. Son los MISMOS registros que pinta
 * cada hilo por separado (`RegistroEspejo`, el espejo de la puerta del A1), así que un mensaje
 * o una respuesta se ve igual en cualquiera de las tres superficies.
 *
 * PURO: sin red, sin `node:*` y sin React. Lo usan la pestaña Genesis (para el hilo único) y
 * sus pruebas.
 */

import type { MensajeDirector } from "@/lib/mando/chat-director-tipos";

export type FuenteCrossMedia = "direccion" | "hermes-avisos" | "peticiones" | "avisos-directores";

export const FUENTES_CROSS_MEDIA: readonly FuenteCrossMedia[] = [
    "direccion",
    "hermes-avisos",
    "peticiones",
    "avisos-directores",
];

export type TipoUnificado = "mensaje" | "respuesta" | "informe" | "aviso" | "actualizacion" | "uso";

export const TIPOS_UNIFICADOS: readonly TipoUnificado[] = [
    "mensaje",
    "respuesta",
    "informe",
    "aviso",
    "actualizacion",
    "uso",
];

/** Un mensaje del espejo con la fuente de la que vino (`RegistroEspejo` encaja aquí). */
export interface MensajeConFuente extends MensajeDirector {
    fuente?: string;
}

export interface MensajeUnificado {
    id: string;
    t: string;
    texto: string;
    fuente: FuenteCrossMedia;
    origen: string;
    esDeAlex: boolean;
    tipoUnificado: TipoUnificado;
    canal?: string;
    metadata?: Record<string, unknown>;
}

/** Segundos de una marca ISO; 0 si no se entiende (así nunca lanza y el orden es estable). */
function epochDe(t: string): number {
    if (typeof t !== "string" || t.trim() === "") return 0;
    const ms = Date.parse(t);
    return Number.isFinite(ms) ? ms / 1000 : 0;
}

function esFuente(f: string): f is FuenteCrossMedia {
    return (FUENTES_CROSS_MEDIA as readonly string[]).includes(f);
}

/**
 * La fuente del espejo, en las cuatro claves del hilo único. Acepta `puente:hermes-avisos` y
 * `hermes-avisos` (las dos formas de GEN1113) y `mando`/`direccion`. Lo desconocido cae en
 * `direccion`: es la fuente que siempre se puede leer.
 */
export function normalizarFuente(fuente: string | undefined): FuenteCrossMedia {
    const f = typeof fuente === "string" ? fuente.trim() : "";
    const clave = f.startsWith("puente:") ? f.slice("puente:".length) : f;
    if (esFuente(clave)) return clave;
    return "direccion";
}

export function tipoUnificadoDe(tipo: string): TipoUnificado {
    return (TIPOS_UNIFICADOS as readonly string[]).includes(tipo) ? (tipo as TipoUnificado) : "mensaje";
}

/**
 * Las fuentes que puede leer cada rol. Los puentes A (Hermes) y B (peticiones) son solo de un
 * dueño (§4.2); un desarrollador ve la dirección y los avisos, que son de lectura.
 */
export function fuentesLegibles(esDueno: boolean): FuenteCrossMedia[] {
    return esDueno ? [...FUENTES_CROSS_MEDIA] : ["direccion", "avisos-directores"];
}

/** La clave que espera `cliente.feed` para una fuente (`direccion` o `puente:<clave>`). */
export function claveDeFuente(f: FuenteCrossMedia): string {
    return f === "direccion" ? "direccion" : `puente:${f}`;
}

/**
 * ¿Habló Alex? Por su rol, por su nombre (`alex`, `alex-…`), por el puente de Telegram que
 * reenvía lo que escribe en el móvil, o porque lo escribió desde Genesis en Astraura.
 */
export function esDeAlex(m: MensajeDirector): boolean {
    const de = typeof m.de === "string" ? m.de : "";
    return m.rol === "alex" || de === "alex" || de.startsWith("alex-") || de === "telegram-puente" || de.startsWith("genesis-web");
}

export function mensajeAUnificado(m: MensajeConFuente): MensajeUnificado {
    return {
        id: m.id,
        t: m.t,
        texto: m.texto,
        fuente: normalizarFuente(m.fuente),
        origen: m.de,
        esDeAlex: esDeAlex(m),
        tipoUnificado: tipoUnificadoDe(m.tipo),
        canal: m.canal,
        metadata: {
            rol: m.rol,
            modelo: m.modelo,
            respondeA: m.respondeA,
            tarea: m.tarea,
            sintesis: m.sintesis,
            evento: m.evento,
        },
    };
}

/**
 * Fusiona varias lecturas del espejo en un solo hilo: un mensaje por `id` (si se repite, manda
 * la primera aparición que traiga una fuente conocida) y todo ordenado por hora. Es el mismo
 * criterio de deduplicación por `id` que usa la pestaña Genesis.
 */
export function fusionarMensajes(listas: readonly (readonly MensajeConFuente[])[]): MensajeUnificado[] {
    const porId = new Map<string, MensajeConFuente>();
    for (const lista of listas) {
        for (const m of lista) {
            if (!m || typeof m.id !== "string" || m.id === "") continue;
            const previo = porId.get(m.id);
            if (!previo) porId.set(m.id, m);
            else if (previo.fuente === undefined && m.fuente !== undefined) porId.set(m.id, m);
        }
    }
    return ordenarPorTiempo([...porId.values()].map(mensajeAUnificado));
}

export function ordenarPorTiempo(mensajes: readonly MensajeUnificado[]): MensajeUnificado[] {
    return [...mensajes].sort((a, b) => {
        const d = epochDe(a.t) - epochDe(b.t);
        if (d !== 0) return d;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

export function filtrarPorFuente(mensajes: readonly MensajeUnificado[], fuente: FuenteCrossMedia): MensajeUnificado[] {
    return mensajes.filter((m) => m.fuente === fuente);
}
