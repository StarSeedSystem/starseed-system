/**
 * Guardia de los avisos de sesión con guía (GUI1021N · Ola 1021G) — lógica PURA.
 *
 * §5 de `architecture/guias-introduccion.md`: un aviso «Inicia sesión para…» solo existe de
 * dos maneras buenas: como uso de `<AvisoSesion` (el aviso común, con «Iniciar sesión» y
 * «Conoce StarSeed») o como un toast que SÍ ofrece la acción de la guía (`action` con
 * `abrirGuia`). Se permiten además los errores de retoma («Inicia sesión de nuevo…»),
 * `auth-gate.tsx` y la consola de la terminal. Lo suelto que YA existe hoy lo registra la
 * línea base (`avisos-sesion-base.ts`): un aviso suelto que no esté allí es un aviso nuevo,
 * y por esa sí que cae la cascadura.
 *
 * Módulo puro: sin React, sin `node:*`, sin almacén. La prueba trae las líneas reales de
 * `src/components` y llama a estas funciones; nada lee ni toca disco aquí.
 */

import { ARCHIVOS_EXENTOS, AVISOS_SUELTOS_HOY } from "./avisos-sesion-base";

/** El texto que delata al aviso de sesión. */
export const TEXTO_AVISO = "Inicia sesión para";

/** Un aviso suelto: la línea donde vive (1 es la primera) y el texto que sigue al aviso. */
export interface AvisoSuelto {
  linea: number;
  complemento: string;
}

/** El complemento textual del aviso: desde «Inicia sesión para» hasta la primera comilla
 *  (`"`, `'` o «`»), ángulo (`<`), llave (`}`) o punto y coma, con espacios colapsados. */
export function complementoDe(linea: string): string {
  const desde = linea.indexOf(TEXTO_AVISO);
  if (desde < 0) return "";
  const reto = linea.slice(desde + TEXTO_AVISO.length);
  const corte = reto.slice(1).search(/["'`<>;}]/);
  const trozo = corte >= 0 ? reto.slice(0, corte + 1) : reto;
  return trozo.replace(/\s+/g, " ").trim();
}

/** ¿La línea i está dentro de un uso de `<AvisoSesion`? Mira hasta 12 líneas hacia arriba y
 *  se detiene en lo que delata el fin del bloque (cierre de tag, `};`, `);` o `return (`). */
function dentroDeAvisoSesion(lineas: readonly string[], indice: number): boolean {
  const techo = Math.max(0, indice - 12);
  for (let j = indice; j >= techo; j--) {
    const linea = lineas[j];
    if (/<AvisoSesion/.test(linea)) return true;
    if (j !== indice && /<\/|\/>|};|\);|return\(|=\s*\(/.test(linea)) return false;
  }
  return false;
}

/** ¿La línea i pertenece a un toast (`toast.error/info/...`) que SÍ ofrece la guía? */
function toastConGuia(lineas: readonly string[], indice: number): boolean {
  if (!/toast\s*\.\s*(error|info|message|success|loading)\s*\(/.test(lineas[indice])) return false;
  const bloque = lineas
    .slice(indice, indice + 13)
    .join("\n");
  return /action\s*:/.test(bloque) && /abrirGuia|Conoce StarSeed/.test(bloque);
}

/** ¿Es un error de retoma («Inicia sesión de nuevo…»)? Está permitido: no pide nada nuevo. */
export function esErrorRetoma(linea: string): boolean {
  return /Inicia sesión de nuevo/.test(linea);
}

/** ¿El archivo está exento por lo que ES (la puerta de acceso, el aviso común, la terminal)? */
export function archivoExento(relativo: string): boolean {
  return (ARCHIVOS_EXENTOS as readonly string[]).includes(relativo);
}

/** Los avisos sueltos de un archivo: cada línea con «Inicia sesión para» que no esté protegida
 *  por `<AvisoSesion`, por un toast con la guía o sea un error de retoma. */
export function avisosSuelto(lineas: readonly string[]): AvisoSuelto[] {
  const sueltos: AvisoSuelto[] = [];
  lineas.forEach((linea, i) => {
    if (!linea.includes(TEXTO_AVISO)) return;
    if (esErrorRetoma(linea) || dentroDeAvisoSesion(lineas, i) || toastConGuia(lineas, i)) return;
    const complemento = complementoDe(linea);
    if (complemento) sueltos.push({ linea: i + 1, complemento });
  });
  return sueltos;
}

/** De los avisos sueltos, los que NO constan en la línea base del código de hoy: solo esos
 *  hacen caer la guardia (un aviso suelto registrado no es nuevo, es deuda heredada). */
export function avisosNuevos(relativo: string, avisos: readonly AvisoSuelto[]): AvisoSuelto[] {
  if (archivoExento(relativo)) return [];
  const conocidos = AVISOS_SUELTOS_HOY[relativo] ?? [];
  return avisos.filter((aviso) => !conocidos.includes(aviso.complemento));
}

