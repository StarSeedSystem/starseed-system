/**
 * StarSeed OS — Corrector del oído por glosario de nombres propios.
 * Módulo puro: entra el texto que escribió cualquier motor del oído (Phonon-2, Parakeet v3,
 * VibeASR 1.58 o el del navegador), sale el texto corregido y la lista de cambios.
 * Sin red, sin disco, sin procesos; toda decisión sale de la propia cadena.
 * Contrato: architecture/voz-fusionada-astraura.md §3 («Las palabras propias se enseñan»).
 * Ondas medidas el 2026-10-15 que corrige: «Star Sed», «StarSead», «Estora» (Phonon-2)
 * y «Star Said», «Astora» (Parakeet v3).
 */

/** La distancia de edición debe quedar por debajo de este límite (medida sobre 0..1). */
const LIMITE_FORMA = 0.34;
/** Ventana de empate: a distancia casi igual gana el nombre más largo del glosario. */
const VENTANA_EMPATE = 0.05;
/** Diferencia de longitud máxima entre la forma unida de dos palabras y el nombre del glosario. */
const LIMITE_LARGO_PAR = 1;

/** Distancia de edición (Levenshtein) entre dos cadenas. */
function distanciaEdicion(a: string, b: string): number {
  const matriz = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matriz[i][0] = i;
  for (let j = 0; j <= b.length; j++) matriz[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(matriz[i - 1][j] + 1, matriz[i][j - 1] + 1, matriz[i - 1][j - 1] + costo);
    }
  }
  return matriz[a.length][b.length];
}

/** Forma de comparación: sin espacios, sin tildes y en minúsculas («Génesis» → «génesis»). */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * Palabras frecuentes del idioma: nunca se reescriben, aunque caigan dentro del límite
 * («star» queda a 0,333 de «StarSeed»; «said» y «sed» también deben mantenerse tal cual).
 */
const PALABRAS_COMUNES: Record<string, string[]> = {
  es: ["star", "said", "sed", "or", "la", "el", "los", "las", "un", "una", "y", "o", "u", "pero", "si", "no", "como", "hola"],
  en: ["star", "said", "sed", "the", "a", "an", "and", "or", "but", "if", "not", "to", "of", "in", "on", "at", "for", "with", "by", "hello", "how", "are", "you"],
};

/** El nombre base del glosario (sistema) más los nombres que llegan: la persona, sus bots, su grupo. */
export function glosarioBase(nombresExtra: string[] = []): string[] {
  return [
    "Astraura",
    "StarSeed",
    "Genesis",
    "MetaGenesis",
    "PoliGenesis",
    "ProtoGenesis",
    "Aurora",
    "Hermes",
    ...nombresExtra,
  ];
}

interface MejorNombre {
  nombre: string;
  largoNormalizado: number;
  ediciones: number;
}

/** El nombre del glosario más cercano a la forma dada; a distancia casi igual, el más largo. */
function mejorEnGlosario(forma: string, glosario: string[]): MejorNombre | null {
  let mejor: MejorNombre | null = null;
  let mejorRatio = Infinity;
  for (const nombre of glosario) {
    const formaNombre = normalizar(nombre);
    const ediciones = distanciaEdicion(forma, formaNombre);
    const total = forma.length + formaNombre.length;
    if (total === 0) continue;
    const ratio = ediciones / total;
    if (ratio > LIMITE_FORMA) continue;
    const cambia =
      !mejor ||
      ratio < mejorRatio - VENTANA_EMPATE ||
      (Math.abs(ratio - mejorRatio) <= VENTANA_EMPATE && formaNombre.length > mejor.largoNormalizado);
    if (cambia) {
      mejor = { nombre, largoNormalizado: formaNombre.length, ediciones };
      mejorRatio = ratio;
    }
  }
  return mejor;
}

/**
 * Corrige el texto del oído con el glosario de nombres propios.
 * @param texto Texto tal como lo escribió el motor del oído.
 * @param glosario Nombres propios válidos (glosarioBase más los de la persona y su grupo).
 * @param idioma Idioma del texto («es» o «en») para la lista de palabras comunes.
 * @returns El texto corregido y la lista de cambios con la forma original y la final.
 */
export function corregirConGlosario(
  texto: string,
  glosario: string[],
  idioma: string = "es"
): { texto: string; cambios: string[] } {
  if (!texto.trim()) return { texto, cambios: [] };

  const comunes = PALABRAS_COMUNES[idioma] ?? PALABRAS_COMUNES.es;
  const palabras = texto.split(/\s+/);
  const salida: string[] = [];
  const cambios: string[] = [];
  let i = 0;

  while (i < palabras.length) {
    // 1) Juntar hasta dos palabras seguidas: «Star Sed», «Star Said» → «StarSeed».
    //    Solo si alguna va con mayúscula: «star said» son palabras comunes y no se tocan.
    if (i + 1 < palabras.length && /[A-ZÁÉÍÓÚÜÑ]/.test(palabras[i] + palabras[i + 1])) {
      const formaPar = normalizar(`${palabras[i]} ${palabras[i + 1]}`);
      const mejorPar = mejorEnGlosario(formaPar, glosario);
      if (mejorPar) {
        if (Math.abs(formaPar.length - mejorPar.largoNormalizado) <= LIMITE_LARGO_PAR) {
          salida.push(mejorPar.nombre);
          cambios.push(`${palabras[i]} ${palabras[i + 1]} → ${mejorPar.nombre}`);
        } else {
          // La forma unida casi encaja pero de otro largo: nada se reescribe ni se reintenta
          // palabra a palabra, para no convertir «Starra Seed» en «StarSeed Seed».
          salida.push(palabras[i], palabras[i + 1]);
        }
        i += 2;
        continue;
      }
    }

    // 2) Una sola palabra, mientras no sea común del idioma: «star», «said» y «sed» se quedan.
    const forma1 = normalizar(palabras[i]);
    if (!comunes.includes(forma1)) {
      const mejorUno = mejorEnGlosario(forma1, glosario);
      if (mejorUno) {
        salida.push(mejorUno.nombre);
        cambios.push(`${palabras[i]} → ${mejorUno.nombre}`);
        i += 1;
        continue;
      }
    }
    salida.push(palabras[i]);
    i += 1;
  }

  return { texto: salida.join(" "), cambios };
}
