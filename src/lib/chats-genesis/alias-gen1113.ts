/**
 * Chats de Genesis · lo que queda de las etiquetas de GEN1113 (contrato GEN1114 §2.3, §2.6, §3.4 y §3.9).
 *
 * PURO: sin red, sin `node:*` y sin React.
 *
 * Las cuatro listas de etiquetas fijas de GEN1113 («Hermes y avisos»…) dejan de ser nombres: aquí
 * quedan como ALIAS y como respaldo PROVISIONAL cuando falta el catálogo de la Mac. El nombre real
 * lo da siempre `nombreDeChat` (canon.ts).
 *
 * Dos cosas de este archivo NO vienen nunca del catálogo, porque el catálogo lo sirve la puerta y la
 * puerta no es de confianza:
 *  · `DESTINO_DE_FUENTE`: la descripción fija de a dónde va lo que se escribe («Hermes, que puede
 *    usar herramientas en tu Mac»), para la línea «Va a …» antes de enviar algo `alto` (§3.9);
 *  · la relación fija fuente → chat (§3.4): `direccion` → `genesis` (o `genesis.canal.<c>`), y
 *    cada puente → el chat cuyo alias incluye su clave de transporte.
 */

import type { FuenteEspejo, PuenteTelegram } from "./tipos";

/**
 * Las claves de transporte de GEN1113 con su etiqueta vieja. La clave es el alias fijo que la Mac
 * acepta cuando aún no tiene `canon.json` (§3.5, paso 4).
 */
export const ALIAS_GEN1113: Readonly<Record<string, { fuente: FuenteEspejo; etiqueta: string }>> = Object.freeze({
    direccion: { fuente: "direccion", etiqueta: "GENESIS · StarSeed OS" },
    "puente:hermes-avisos": { fuente: "puente:hermes-avisos", etiqueta: "Hermes y avisos" },
    "puente:peticiones": { fuente: "puente:peticiones", etiqueta: "Peticiones y encargos" },
    "puente:avisos-directores": { fuente: "puente:avisos-directores", etiqueta: "Avisos de los directores" },
});

/** El id del chat de la dirección: fijo en el código (§2.1, decisión D1). */
export const ID_DIRECCION = "genesis";
/** Prefijo de los nueve canales de los directores. */
export const PREFIJO_CANAL = "genesis.canal.";
/** Prefijo de los puentes de Telegram (el resto lo da `@usuario` del bot al descubrirlo en la Mac). */
export const PREFIJO_TELEGRAM = "telegram.";

/** Todos los nombres con que GEN1113 llamó a cada fuente: van al `alias[]` del chat (§2.3). */
export const ALIAS_DE_FUENTE: Readonly<Record<FuenteEspejo, readonly string[]>> = Object.freeze({
    direccion: Object.freeze(["direccion", "mando"]),
    "puente:hermes-avisos": Object.freeze(["puente:hermes-avisos", "hermes-avisos", "Hermes y avisos"]),
    "puente:peticiones": Object.freeze(["puente:peticiones", "peticiones", "Peticiones y encargos"]),
    "puente:avisos-directores": Object.freeze(["puente:avisos-directores", "avisos-directores", "Avisos de los directores"]),
});

/**
 * A dónde va de verdad lo que se escribe en cada fuente. Texto fijo del código, nunca del catálogo:
 * es lo que la persona lee antes de firmar algo `alto` («Va a …»).
 */
export const DESTINO_DE_FUENTE: Readonly<Record<FuenteEspejo, string>> = Object.freeze({
    direccion: "la dirección de Genesis en tu Mac (los motores de los directores contestan si se lo pides)",
    "puente:hermes-avisos": "Hermes, que puede usar herramientas en tu Mac",
    "puente:peticiones": "las peticiones del A1, que trabajan agentes",
    "puente:avisos-directores": "los avisos de los directores (solo lectura)",
});

/** La fuente de una clave de GEN1113 («hermes-avisos», «puente:hermes-avisos», «Hermes y avisos», «direccion», «mando»…). */
export function fuenteDeAlias(clave: string): FuenteEspejo | null {
    if (typeof clave !== "string") return null;
    for (const [fuente, alias] of Object.entries(ALIAS_DE_FUENTE) as [FuenteEspejo, readonly string[]][]) {
        if (alias.includes(clave)) return fuente;
    }
    return null;
}

/** La fuente de un puente (atajo, para no repetir el prefijo). */
export function fuenteDePuenteGen1113(p: PuenteTelegram): FuenteEspejo {
    return `puente:${p}` as FuenteEspejo;
}

/** La etiqueta PROVISIONAL de una fuente (la de GEN1113): solo se ve con la marca «nombre provisional». */
export function etiquetaProvisional(f: FuenteEspejo): string {
    return ALIAS_GEN1113[f]?.etiqueta ?? f;
}
