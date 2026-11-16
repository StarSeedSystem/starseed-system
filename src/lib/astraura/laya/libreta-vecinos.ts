// Vecinos más cercanos de la libreta de ejemplos de Laya (architecture/jev-entrena-laya.md §3 y §8).
// La libreta une cada decisión de Jev con su desenlace real; este módulo es la capa que la consulta:
// una huella de palabras (bolsa dispersa de 256 posiciones) y el voto de los vecinos más parecidos.
// PURA: sin red, sin disco, sin reloj y sin modelo, así que cabe en una tableta (contrato JLA1116A).
// El maestro es el desenlace (§3): sin desenlace conocido no se vota, y lo que falló no sostiene su respuesta.

/** Un ejemplo de la libreta: la decisión de Jev con su desenlace (§3). */
export interface EjemploLibreta {
  readonly punto: string; // punto de decisión (el catálogo de `puntos-decision.ts`)
  readonly ambito: string; // personal, página, grupo, colectivo… solo se ve desde su ámbito
  readonly estado: string; // el estado que se vio (el prompt, en claro o su huella)
  readonly respuesta: string; // la respuesta que dio Jev
  readonly desenlaceOk: boolean | null; // true acertó · false falló · null se desconoce (no vota)
}

/** Un vecino: el ejemplo de la libreta y lo parecido que es al estado que se consulta. */
export interface VecinoLibreta {
  readonly ejemplo: EjemploLibreta;
  readonly similitud: number;
}

/** Vector disperso de palabras: posición (hash) → peso. Como mucho 256 posiciones. */
export type HuellaPalabras = Readonly<Record<number, number>>;

/** Posiciones del vector disperso: ancho de sobra para una tableta y cada una es una casilla. */
export const POSICIONES_HUELLAS = 256;
/** Vecinos que hacen falta para que el voto cuente (contrato JLA1116A). */
export const MIN_VECINOS = 5;
/** Apoyo mínimo del ganador para que su respuesta valga (contrato JLA1116A). */
export const UMBRAL_APOYO = 0.6;

/** Palabras que no distinguen un caso de otro: no pesan. */
const VACIAS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "y", "o", "que", "en", "para", "con", "por", "es", "se", "su", "lo", "al", "del",
]);

/** Texto → palabras: minúsculas, sin acentos, solo letras y cifras, sin las vacías. */
function palabras(texto: string): string[] {
  const limpio = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return (limpio.match(/[\p{L}\p{N}]+/gu) ?? []).filter((p) => p.length > 1 && !VACIAS.has(p));
}

/** FNV-1a de 32 bits: el mismo hash que `huellaEstado` (aprendizaje-laya.ts), sin Node. */
function fnv1a(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** Huella de palabras: bolsa normalizada (pesos L2) repartida en 256 posiciones por hash. */
export function huellaPalabras(texto: string): HuellaPalabras {
  const pesos = new Map<number, number>();
  for (const palabra of palabras(texto)) {
    const pos = fnv1a(palabra) % POSICIONES_HUELLAS;
    pesos.set(pos, (pesos.get(pos) ?? 0) + 1);
  }
  let suma = 0;
  for (const v of pesos.values()) suma += v * v;
  const salida: Record<number, number> = {};
  const norma = Math.sqrt(suma);
  if (norma > 0) for (const [pos, v] of pesos) salida[pos] = v / norma;
  return Object.freeze(salida);
}

/** Similitud del coseno entre dos huellas: 0 si no comparten nada, 1 si son la misma bolsa. */
export function similitud(a: HuellaPalabras, b: HuellaPalabras): number {
  let punto = 0, na = 0, nb = 0;
  for (const p in a) {
    const x = a[Number(p)];
    na += x * x;
    if (p in b) punto += x * b[Number(p)];
  }
  for (const p in b) nb += b[Number(p)] ** 2;
  if (na === 0 || nb === 0) return 0;
  return Math.min(1, Math.max(0, punto / (Math.sqrt(na) * Math.sqrt(nb))));
}

/** Vecinos de un estado: ejemplos del MISMO ámbito y con desenlace conocido, los más parecidos
 *  primero (§5 y §3). El desempate es estable: a igual parecido, el que estaba antes va antes. */
export function vecinos(libreta: readonly EjemploLibreta[], estado: string, k: number,
  ambito: string): VecinoLibreta[] {
  if (k <= 0) return [];
  const consulta = huellaPalabras(estado);
  const candidatos: { vecino: VecinoLibreta; orden: number }[] = [];
  libreta.forEach((ejemplo, orden) => {
    if (ejemplo.ambito !== ambito) return;
    if (ejemplo.desenlaceOk === null) return;
    const s = similitud(consulta, huellaPalabras(ejemplo.estado));
    if (s <= 0) return; // sin una palabra en común no es vecino
    candidatos.push({ vecino: { ejemplo, similitud: s }, orden });
  });
  candidatos.sort((a, b) => (b.vecino.similitud - a.vecino.similitud) || (a.orden - b.orden));
  return candidatos.slice(0, k).map((c) => c.vecino);
}

/** Voto de los vecinos: la respuesta que más peso apoya (el peso es su parecido al estado). Solo
 *  sostienen su respuesta los ejemplos que ACERTARON. Con menos de `MIN_VECINOS` vecinos, o con un
 *  apoyo por debajo de `UMBRAL_APOYO`, no hay voto: `null`. */
export function votar(vecinos: readonly VecinoLibreta[]): { respuesta: string; apoyo: number } | null {
  if (vecinos.length < MIN_VECINOS) return null;
  const pesos = new Map<string, number>();
  let total = 0;
  for (const v of vecinos) {
    if (v.ejemplo.desenlaceOk !== true) continue;
    const peso = v.similitud > 0 ? v.similitud : 0;
    pesos.set(v.ejemplo.respuesta, (pesos.get(v.ejemplo.respuesta) ?? 0) + peso);
    total += peso;
  }
  if (total <= 0) return null;
  let mejor = "";
  let pesoMejor = -1;
  for (const [respuesta, peso] of pesos) {
    if (peso > pesoMejor) { mejor = respuesta; pesoMejor = peso; } // a igual peso, el primero
  }
  const apoyo = pesoMejor / total;
  if (apoyo < UMBRAL_APOYO) return null;
  return { respuesta: mejor, apoyo };
}
