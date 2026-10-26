/**
 * Petición a la Protomolécula · de la descripción de un objeto 3D a una primitiva de la escena (Ola 1026P · P3).
 * Solo se crea lo que la escena 3D compartida SABE hacer (caja, esfera, cilindro, cono, toro, plano); una forma libre
 * («una nave espacial») no se inventa: se dice. Módulo PURO: sin React, red ni `node:*`.
 */
import type { TipoObjeto } from "@/lib/vivo/espacial/modelo";
import { plano } from "./reglas";

export interface ObjetoDescrito {
  tipo: Extract<TipoObjeto, "caja" | "esfera" | "cilindro" | "cono" | "toro" | "plano">;
  nombre: string;
  /** #rrggbb */
  color: string;
  nombreColor: string | null;
  alambre: boolean;
  brillante: boolean;
}

const FORMAS: Array<[ObjetoDescrito["tipo"], string, RegExp]> = [
  ["caja", "Cubo", /\b(cubo|caja|cuadrado|dado|bloque)\b/],
  ["esfera", "Esfera", /\b(esfera|bola|pelota|globo|planeta|orbe)\b/],
  ["cilindro", "Cilindro", /\b(cilindro|tubo|columna|barril)\b/],
  ["cono", "Cono", /\b(cono|piramide|embudo)\b/],
  ["toro", "Toro", /\b(toro|donut|rosquilla|anillo|aro)\b/],
  ["plano", "Plano", /\b(plano|suelo|lamina|panel)\b/],
];

/** Colores de la paleta de la escena (los mismos de `PALETA_ESCENA`), por palabra. */
const COLORES: Array<[string, string, RegExp]> = [
  ["#DC143C", "rojo", /\b(rojo|roja|carmesi|escarlata)\b/],
  ["#007FFF", "azul", /\b(azul|celeste)\b/],
  ["#39FF14", "verde neón", /\b(verde neon|lima|fluorescente)\b/],
  ["#10B981", "verde", /\b(verde|esmeralda)\b/],
  ["#FFBF00", "ámbar", /\b(amarillo|amarilla|ambar|dorado|dorada|oro)\b/],
  ["#F97316", "naranja", /\b(naranja|anaranjado)\b/],
  ["#EC4899", "rosa", /\b(rosa|rosado|magenta|fucsia)\b/],
  ["#14B8A6", "turquesa", /\b(turquesa|cian|aguamarina)\b/],
  ["#F5F5F7", "blanco", /\b(blanco|blanca|plateado|plateada)\b/],
  ["#7C5CFF", "violeta", /\b(violeta|morado|morada|purpura|lila)\b/],
];

/** null = la descripción no nombra ninguna forma que la escena sepa crear. */
export function describirObjeto3d(descripcion: string): ObjetoDescrito | null {
  const n = plano(descripcion);
  const forma = FORMAS.find(([, , re]) => re.test(n));
  if (!forma) return null;
  const color = COLORES.find(([, , re]) => re.test(n));
  const nombre = color ? `${forma[1]} ${color[1]}` : forma[1];
  return {
    tipo: forma[0],
    nombre,
    color: color?.[0] ?? "#7C5CFF",
    nombreColor: color?.[1] ?? null,
    alambre: /\b(alambre|malla|wireframe|esqueleto)\b/.test(n),
    brillante: /\b(brilla|brillante|luminos[oa]|neon|emisiv[oa]|resplandece)\b/.test(n),
  };
}

export const FORMAS_3D_SOPORTADAS = "cubo, esfera, cilindro, cono, toro y plano";
