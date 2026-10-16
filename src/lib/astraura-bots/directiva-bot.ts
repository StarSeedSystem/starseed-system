/**
 * Bots/dots de Astraura · Directiva [[BOT: …]] (BOT1011G). Contrato: architecture/astraura-bots.md.
 *
 * El modelo escribe bloques `[[BOT: {"tipo":"navegar","args":{…}}]]` dentro de su respuesta
 * hablada (igual que el `[[ACCION: …]]` de `src/lib/aurora/actions.ts`). Este extractor los
 * aparta del texto que se lee en voz alta y pasa cada uno por `validarAccion` con la misma
 * desconfianza de siempre: el JSON roto o la acción inválida NO se ejecuta, se cuenta en
 * `problemas`, y esto nunca lanza. Como mucho 5 acciones por respuesta; las de más se
 * descartan dicho en `problemas`. PURO: sin React, sin red, sin reloj, sin `node:*`.
 */
import type { AccionBot } from "./acciones";
import { validarAccion } from "./acciones";

export interface DirectivasExtraidas {
  limpio: string;
  acciones: AccionBot[];
  problemas: string[];
}

/** Tope de acciones por respuesta (el contrato dice «como mucho 5»). */
export const MAX_DIRECTIVAS = 5;

const MARCA = "[[BOT:";
const CIERRE = "]]";

/** Igual que las rutas «ruta» de `validarAccion`: una directiva jamás apunta fuera del OS. */

/** Localiza el cierre `}` equilibrado del JSON que empieza en `desde` (respetando comillas). */
function cierreJson(texto: string, desde: number): number {
  let profundidad = 0;
  let enCadena = false;
  let escapado = false;
  for (let i = desde; i < texto.length; i++) {
    const c = texto[i];
    if (enCadena) {
      if (escapado) escapado = false;
      else if (c === "\\") escapado = true;
      else if (c === '"') enCadena = false;
      continue;
    }
    if (c === '"') enCadena = true;
    else if (c === "{") profundidad++;
    else if (c === "}") {
      profundidad--;
      if (profundidad === 0) return i;
    }
  }
  return -1;
}

/** Lee un texto hablado y separa voz limpia, acciones válidas y problemas. Nunca lanza. */
export function extraerDirectivas(texto: string): DirectivasExtraidas {
  const acciones: AccionBot[] = [];
  const problemas: string[] = [];
  if (!texto) return { limpio: "", acciones, problemas };
  const partes: string[] = [];
  let resto = texto;
  for (;;) {
    const ini = resto.indexOf(MARCA);
    if (ini < 0) break;
    partes.push(resto.slice(0, ini));
    const desdeJson = ini + MARCA.length;
    const finJson = cierreJson(resto, desdeJson);
    if (finJson < 0) {
      problemas.push("Directiva sin cierre: se descarta el resto del bloque.");
      resto = "";
      break;
    }
    const tras = resto.slice(finJson + 1);
    const fin = tras.startsWith(CIERRE) ? finJson + 1 + CIERRE.length : finJson + 1;
    let bruto: unknown;
    try {
      bruto = JSON.parse(resto.slice(desdeJson, finJson + 1));
    } catch {
      problemas.push("Directiva ilegible: el JSON está roto.");
      resto = resto.slice(fin);
      continue;
    }
    const { accion, problemas: deAccion } = validarAccion(bruto);
    problemas.push(...deAccion);
    if (accion) {
      if (acciones.length < MAX_DIRECTIVAS) acciones.push(accion);
      else problemas.push(`Directiva «${accion.tipo}» descartada: máximo ${MAX_DIRECTIVAS} por respuesta.`);
    }
    resto = resto.slice(fin);
  }
  partes.push(resto);
  const limpio = partes
    .join(" ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { limpio, acciones, problemas };
}