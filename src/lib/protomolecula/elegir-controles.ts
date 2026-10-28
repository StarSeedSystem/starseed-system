/**
 * Protomolécula · ELEGIR CONTROLES (Ola 1010P · cola F7 · esbozo PM1010F7B).
 * Con más de 30 controles abiertos, `elegirControles(frase, candidatos, deps)` pide a
 * Needle 3 (o a Jev, vía el `preguntar` INYECTADO) los 5 más probables y los devuelve
 * como CANDIDATOS al dictado: todavía pasan por `entenderDictado` y toda operación por
 * `decidirOperacion` — este módulo NUNCA aplica nada por sí mismo. Si la IA no responde
 * cae a una elección DETERMINISTA por distancia de nombres (la misma limpieza de ./dictado).
 * Módulo PURO: sin red, sin disco, sin `node:*`.
 */
import { limpiarFrase } from "./dictado";
import type { CandidatoParametro } from "./tipos";

/** Por debajo de este número el dictado se basta solo: pásale todos los controles. */
export const MAX_SIN_ELECCION = 30;
/** Los que se devuelven al dictado cuando hay que elegir. */
export const CUANTOS_ELEGIDOS = 5;

/** Pregunta a Needle 3 / Jev y devuelve los nombres elegidos (o null si no respondió). */
export type Preguntar = (frase: string, nombres: string[]) => Promise<string[] | null>;

export interface DependenciasElegir {
  preguntar?: Preguntar;
}

export type Eleccion =
  | { elegidos: CandidatoParametro[]; origen: "needle" }
  | { elegidos: CandidatoParametro[]; origen: "respaldo" };

/** Etiqueta que se enseña a la IA y con la que se le matchea: desambigua por átomo. */
const etiquetaDe = (c: CandidatoParametro): string => `${c.parametro.nombre} de ${c.atomo ?? c.ref.atomoId}`;
const claveRespuesta = (c: CandidatoParametro): string => `${c.ref.atomoId}::${c.ref.parametroId}`;

/** Acepta que la IA devuelva solo el nombre del parámetro, si es único entre los abiertos. */
function porNombreSuave(nombre: string, cs: CandidatoParametro[]): CandidatoParametro | null {
  const exactos = cs.filter((c) => limpiarFrase(c.parametro.nombre) === nombre);
  return exactos.length === 1 ? exactos[0] : null;
}

/** Distancia de edición (Levenshtein, como la local de ./dictado) para el respaldo determinista. */
function distancia(a: string, b: string): number {
  let fila = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    const anterior: number[] = fila;
    fila = [i];
    for (let k = 1; k <= b.length; k++) {
      fila.push(Math.min(anterior[k] + 1, fila[k - 1] + 1, anterior[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)));
    }
  }
  return fila[b.length];
}

/** Respaldo: los más cerca de la frase, con orden fiable (distancia, nombre, ids). */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const SIN_CERCANIA = Number.MAX_SAFE_INTEGER;

function elegirPorDistancia(
  frase: string,
  cs: CandidatoParametro[],
  cuantos: number
): CandidatoParametro[] {
  const tokens = limpiarFrase(typeof frase === "string" ? frase : "").split(" ").filter(Boolean);
  const puntuados = cs.map((c) => {
    const claves = [c.parametro.nombre, ...(c.parametro.sinonimos ?? [])].map((x) =>
      limpiarFrase(typeof x === "string" ? x : "")
    );
    let mejor = SIN_CERCANIA;
    for (const k of claves) {
      if (!k) continue;
      const palabras = k.split(" ").length;
      for (let i = 0; i + palabras <= tokens.length; i++) {
        const ventana = tokens.slice(i, i + palabras).join(" ");
        mejor = Math.min(mejor, distancia(ventana, k));
      }
    }
    return { c, mejor };
  });
  puntuados.sort(
    (x, y) =>
      x.mejor - y.mejor ||
      cmp(limpiarFrase(x.c.parametro.nombre), limpiarFrase(y.c.parametro.nombre)) ||
      cmp(x.c.ref.atomoId, y.c.ref.atomoId) ||
      cmp(x.c.ref.parametroId, y.c.ref.parametroId)
  );
  return puntuados.slice(0, cuantos).map((p) => p.c);
}

export async function elegirControles(frase: string, candidatos: CandidatoParametro[], deps: DependenciasElegir = {}): Promise<Eleccion> {
  if (!candidatos.length) return { elegidos: [], origen: "respaldo" };
  if (candidatos.length <= MAX_SIN_ELECCION) return { elegidos: candidatos, origen: "respaldo" };

  const etiquetas = new Map<string, CandidatoParametro>();
  for (const c of candidatos) etiquetas.set(limpiarFrase(etiquetaDe(c)), c);
  const nombres = candidatos.map((c) => etiquetaDe(c));

  if (deps.preguntar) {
    let respuesta: string[] | null = null;
    try {
      respuesta = await deps.preguntar(frase, nombres);
    } catch {
      respuesta = null;
    }
    if (respuesta && respuesta.length) {
      const elegidos: CandidatoParametro[] = [];
      const vistas = new Set<string>();
      for (const n of respuesta) {
        const clave = limpiarFrase(typeof n === "string" ? n : "");
        const c = etiquetas.get(clave) ?? porNombreSuave(clave, candidatos);
        if (c && !vistas.has(claveRespuesta(c)) && clave) {
          vistas.add(claveRespuesta(c));
          elegidos.push(c);
        }
        if (elegidos.length >= CUANTOS_ELEGIDOS) break;
      }
      if (elegidos.length) return { elegidos, origen: "needle" };
    }
  }
  return { elegidos: elegirPorDistancia(frase, candidatos, CUANTOS_ELEGIDOS), origen: "respaldo" };
}
