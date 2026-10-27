"use client";
/**
 * Oído · corrector por glosario tras cualquier motor de voz (Ola 1015V, tarea V).
 * Contrato: architecture/voz-fusionada-astraura.md §3 regla 3 y aurora-voz-motores.md
 * (ninguna función de la capa lanza). Los motores fallan igual en los nombres
 * propios: «Star Sed», «StarSead», «Star Said» → StarSeed; «Estora», «Astora» →
 * Astraura. Corrige ventanas de una o dos palabras, forma sin espacios, mayúsculas
 * ni acentos, si d / (largo forma + largo nombre) ≤ 0,34 y la forma no es palabra
 * común («star», «sed», «there»…); nombre partido en dos se fusiona solo si AMBAS
 * llevan mayúscula; texto exacto a un nombre manda, y si casan varios sin ser
 * exacto manda el más largo. Módulo puro: sin red ni disco.
 */
export interface ResultadoCorreccion {
  texto: string;
  cambios: string[];
}
const UMBRAL_DISTANCIA = 0.34;
const LONGITUD_MINIMA_VENTANA = 4;
/* Palabras frecuentes de es/en (lista corta de la regla, no un léxico completo). */
const PALABRAS_COMUNES: Record<string, string[]> = {
  es: ["star", "said", "sed", "estrella", "estrellas", "europa", "carmen", "amores", "morada", "germenes", "estaba", "estar", "estas", "estos", "esto",
    "auras", "aurea", "la", "el", "los", "las", "un", "una", "y", "o", "pero", "si", "no", "con", "como", "para", "que", "de", "del", "en", "es", "son", "hola"],
  en: ["star", "said", "sed", "there", "were", "our", "here", "hare", "hers", "farther", "harms", "the", "and", "or", "but", "if", "not", "to", "of", "in",
    "on", "at", "for", "with", "by", "are", "you", "this", "that", "than", "then", "how", "hello", "what", "when", "tones", "seeds", "starts"],
};
/** Distancia de edición (Levenshtein) en programación dinámica. */
function distanciaEdicion(a: string, b: string): number {
  let previa: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual: number[] = [i];
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + coste);
    }
    for (let j = 0; j <= b.length; j++) previa[j] = actual[j];
  }
  return previa[b.length];
}
/** Forma sin espacios, mayúsculas ni acentos (el oído no escribe acentos). */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();
}
const llevaMayuscula = (p: string): boolean => /[A-ZÁÉÍÓÚÜÑ]/.test(p);
/**
 * Elige el nombre del glosario para la forma: si la forma es un nombre exacto, ese;
 * si casan varios sin exacto, el más largo (a igual largo, la menor distancia).
 * Devuelve null si nada queda bajo el umbral.
 */function mejorCandidato(forma: string, formas: string[], nombres: string[]): string | null {
  let mejor: string | null = null;
  let largoMejor = 0;
  let exactoMejor = false;
  let relativaMejor = Infinity;
  for (let k = 0; k < formas.length; k++) {
    const d = distanciaEdicion(forma, formas[k]);
    const relativa = d / (forma.length + formas[k].length);
    if (relativa > UMBRAL_DISTANCIA) continue;
    const exacto = d === 0;
    const largo = formas[k].length;
    const toma = mejor === null || (exacto && !exactoMejor) ||
      (exacto === exactoMejor &&
        (largo > largoMejor || (largo === largoMejor && !exacto && relativa < relativaMejor)));
    if (toma) {
      mejor = nombres[k];
      largoMejor = largo;
      exactoMejor = exacto;
      relativaMejor = relativa;
    }
  }
  return mejor;
}
/** Nombres del sistema, más los que se le pasen (usuario, bots, grupo); sin repeticiones. */
export function glosarioBase(extra: string[] = []): string[] {
  const base = ["Astraura", "StarSeed", "Genesis", "MetaGenesis", "PoliGenesis", "ProtoGenesis", "Aurora", "Hermes"];
  const vistas = new Set(base.map(normalizar));
  for (const limpia of extra.filter((n): n is string => typeof n === "string" && n.trim().length > 0).map((n) => n.trim())) {
    if (vistas.has(normalizar(limpia))) continue;
    vistas.add(normalizar(limpia));
    base.push(limpia);
  }
  return base;
}
/** Corrige un texto del oído. Nunca lanza: ante entrada inválida, texto tal cual. */
export function corregirConGlosario(texto: string, glosario: string[], idioma: string = "es"): ResultadoCorreccion {
  try {
    const nombres = (Array.isArray(glosario) ? glosario : [])
      .filter((n): n is string => typeof n === "string" && n.trim().length > 0).map((n) => n.trim());
    if (typeof texto !== "string" || texto.length === 0 || nombres.length === 0) return { texto, cambios: [] };
    const formas = nombres.map(normalizar);
    const comunes = new Set(PALABRAS_COMUNES[idioma] ?? PALABRAS_COMUNES.es);
    const palabras = texto.split(/\s+/).filter(Boolean);
    const salida: string[] = [];
    const cambios: string[] = [];
    let i = 0;
    while (i < palabras.length) {
      let fusion: string | null = null; // ventana de dos: un nombre del sistema partido en dos palabras
      if (i + 1 < palabras.length && llevaMayuscula(palabras[i]) && llevaMayuscula(palabras[i + 1])) {
        const pareja = normalizar(`${palabras[i]} ${palabras[i + 1]}`);
        const candidata = !comunes.has(pareja) ? mejorCandidato(pareja, formas, nombres) : null;
        if (candidata && Math.abs(pareja.length - normalizar(candidata).length) <= 2) fusion = candidata;
      }
      if (fusion) {
        salida.push(fusion);
        cambios.push(`${palabras[i]} ${palabras[i + 1]} → ${fusion}`);
        i += 2;
        continue;
      }
      const sola = normalizar(palabras[i]);
      const corregida = sola.length >= LONGITUD_MINIMA_VENTANA && !comunes.has(sola)
        ? mejorCandidato(sola, formas, nombres) : null;
      if (corregida) {
        salida.push(corregida);
        cambios.push(`${palabras[i]} → ${corregida}`);
      } else salida.push(palabras[i]);
      i += 1;
    }
    return { texto: salida.join(" "), cambios };
  } catch {
    return { texto, cambios: [] };
  }
}
