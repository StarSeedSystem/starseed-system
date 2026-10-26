/**
 * Petición a la Protomolécula · elegir el fondo (Ola 1026P · P3).
 * «Cambia el fondo» no se inventa un shader: elige uno de los CUATRO sets oficiales de StarSeed («Fondos con Shaders»,
 * Biblioteca) por las palabras de la petición, y dice cuál eligió y por qué. Módulo PURO: sin React, red ni `node:*`.
 */
import { plano } from "./reglas";

export interface SetFondoOficial { id: string; nombre: string; palabras: RegExp }

export const SETS_FONDO: readonly SetFondoOficial[] = [
  { id: "diseno-cosmos-violeta", nombre: "Cosmos violeta", palabras: /cosmos|cosmic|violeta|morad|purpura|espacio|estelar|nebulos|galax|estrell|noche|oscur|profund/g },
  { id: "diseno-aurora-suave", nombre: "Aurora suave", palabras: /aurora|boreal|verde|azul|turquesa|suave|calm|relaj|natur|agua|mar\b|tranquil/g },
  { id: "diseno-vidrio-cuarzo", nombre: "Vidrio de cuarzo", palabras: /vidrio|cuarzo|cristal|translucid|transparen|claro|luminos|blanc|elegante|moderno|limpio/g },
  { id: "diseno-semilla-dorada", nombre: "Semilla dorada", palabras: /dorad|\boro\b|semilla|calid|ambar|amarill|\bsol\b|prosper|lujo|brillante/g },
];

/** El set que mejor casa con la petición. Sin ninguna palabra que case, el primero (y se dice que no fue por palabra). */
export function elegirSetFondo(descripcion: string): { id: string; nombre: string; porPalabra: boolean } {
  const n = plano(descripcion);
  let mejor = { set: SETS_FONDO[0], puntos: 0 };
  for (const set of SETS_FONDO) {
    const puntos = (n.match(set.palabras) ?? []).length;
    if (puntos > mejor.puntos) mejor = { set, puntos };
  }
  return { id: mejor.set.id, nombre: mejor.set.nombre, porPalabra: mejor.puntos > 0 };
}

export const PREFIJO_CAPA_FONDO = "Astraura · ";

/** Las capas de ahora sin la que puso la petición anterior (si la hay) y con la nueva encima. Pura, no muta la entrada. */
export function capasConFondo(
  capas: ReadonlyArray<Record<string, unknown>>,
  nueva: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const propia = (c: Record<string, unknown>): boolean => typeof c.name === "string" && c.name.startsWith(PREFIJO_CAPA_FONDO);
  return [...capas.filter((c) => !propia(c)), nueva];
}
