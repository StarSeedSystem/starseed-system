/**
 * Corrector por glosario del oído (Ola 1015V · tarea V). Contrato:
 * architecture/voz-fusionada-astraura.md §3.3: tras CUALQUIER motor cambia una
 * forma cercana por la del glosario solo si la distancia de edición normalizada
 * cabe (≤ UMBRAL sobre la forma sin espacios ni mayúsculas, hasta dos palabras
 * juntas) y la forma no es común del idioma. Medido el 2026-10-15: Phonon-2
 * «Star Sed», «StarSead», «Estora»; Parakeet v3 «Star Said», «Astora». Puro.
 */
/** Cambio aplicado: lo que escribió el motor y lo que dejó el glosario. */
export interface CambioGlosario { original: string; corregido: string }
/** Resultado del corrector: texto ya corregido y los cambios que hizo. */
export interface ResultadoOido { texto: string; cambios: CambioGlosario[] }
const UMBRAL = 0.34, BANDA = 0.06, TOPE_PAR = 3;
// UMBRAL: distancia ÷ (largo de la forma + largo del candidato); BANDA: casi-empate,
// dos candidatos tan cerca se decide por el más largo; TOPE_PAR: ediciones al juntar DOS palabras.

/** Palabras frecuentes de es/en: si la forma es una de estas, NO se corrige.
 * Cubre las trampas medidas (star, said, sed), las que caen a poca distancia
 * de un nombre (aurora, estrella, la familia est-) y las partículas comunes. */
const PALABRAS_COMUNES: Record<string, string[]> = {
  es: ["de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "u", "e", "pero", "si", "no", "como", "con", "por", "para", "que", "se", "su", "sus", "es", "son", "era", "esta", "estas", "esto", "estan", "estamos", "estais", "estar", "sed", "seda", "sede", "ser", "sera", "sara", "star", "said", "ora", "oro", "aura", "aurora", "estrella", "genero", "genio", "genios"],
  en: ["the", "a", "an", "and", "or", "but", "if", "not", "to", "of", "in", "on", "at", "for", "with", "by", "is", "are", "was", "were", "has", "have", "said", "sad", "sat", "star", "starts", "era", "aura", "aurora", "genius"],
};
/** Distancia de edición (Levenshtein) entre dos cadenas. */
function distanciaEdicion(a: string, b: string): number {
  const m = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) m[i][0] = i;
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return m[a.length][b.length];
}
/** Forma de comparación: minúsculas, sin espacios ni puntuación pegada. */
function formaDe(trozo: string): string {
  return trozo.toLowerCase().replace(/[\s,.;:!?¿¡«»()'"\-]+/g, "");
}

/** ¿La forma es palabra común del idioma? Con idioma raro se mira en es y en. */
function esPalabraComun(forma: string, idioma: string): boolean {
  return (PALABRAS_COMUNES[idioma] ?? [...PALABRAS_COMUNES.es, ...PALABRAS_COMUNES.en]).includes(forma);
}

/** Glosario base del sistema, más los nombres que se le pasen (usuario, bots y grupo). */
export function glosarioBase(extraNombres: readonly string[] = []): string[] {
  const base = ["Astraura", "StarSeed", "Genesis", "MetaGenesis", "PoliGenesis", "ProtoGenesis", "Aurora", "Hermes"];
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const nombre of [...base, ...extraNombres]) {
    const limpio = nombre.trim();
    if (limpio && !vistas.has(formaDe(limpio))) { vistas.add(formaDe(limpio)); salida.push(limpio); }
  }
  return salida;
}

/** Distancia con la forma hecha de DOS palabras: corta el nombre del glosario
 * en dos y alinea cada trozo con cada palabra («star|sed» → «star|seed»); el
 * nombre no puede ser más corto que la forma ni cambiar más de +2 (no inventa
 * sílabas), y el corte no puede llevar más de TOPE_PAR ediciones; si no, Infinity. */
function distanciaPartida(a: string, b: string, candidata: string): number {
  if (candidata.length < a.length + b.length || candidata.length > a.length + b.length + 2) return Infinity;
  let mejor = Infinity;
  for (let corte = 1; corte < candidata.length; corte++) {
    const d = distanciaEdicion(a, candidata.slice(0, corte)) + distanciaEdicion(b, candidata.slice(corte));
    if (d <= TOPE_PAR && d < mejor) mejor = d;
  }
  return mejor;
}

/** El candidato del glosario con distancia normalizada dentro del umbral; en
 * casi-empate (BANDA) gana el más largo («Estora» y «Astora» → Astraura). */
function candidatoCercano(partes: readonly string[], glosario: readonly string[]): string | null {
  let mejor: string | null = null;
  let mejorNorma = Infinity;
  for (const nombre of glosario) {
    const candidata = formaDe(nombre);
    if (!candidata) continue;
    const d = partes.length === 1 ? distanciaEdicion(partes[0], candidata) : distanciaPartida(partes[0], partes[1], candidata);
    const norma = d / (partes.join("").length + candidata.length);
    if (norma > UMBRAL) continue;
    if (mejor === null || norma < mejorNorma - BANDA || (norma <= mejorNorma + BANDA && candidata.length > formaDe(mejor).length)) {
      mejor = nombre;
      mejorNorma = norma;
    }
  }
  return mejor;
}

/** Corrige el texto del oído: ventana de dos palabras seguidas (con mayúscula
 * y forma no común) y después cada palabra. Conserva puntuación y lo demás. */
export function corregirConGlosario(
  texto: string, glosario: readonly string[], idioma: string = "es"
): ResultadoOido {
  const cambios: CambioGlosario[] = [];
  const reemplazos: Array<{ inicio: number; fin: number; forma: string }> = [];
  const fichas = Array.from(texto.matchAll(/[\p{L}\p{N}]+/gu)).map((m) => ({ inicio: m.index, fin: m.index + m[0].length }));
  for (let i = 0; i < fichas.length; ) {
    let avanzar = 1;
    for (const ventana of [2, 1]) {
      const ultima = i + ventana - 1;
      if (ultima >= fichas.length || (ventana === 2 && !/^\s*$/.test(texto.slice(fichas[i].fin, fichas[i + 1].inicio)))) continue;
      const original = texto.slice(fichas[i].inicio, fichas[ultima].fin);
      const forma = formaDe(original);
      if (!forma || esPalabraComun(forma, idioma) || (ventana === 2 && !/[A-ZÁÉÍÓÚÜÑ]/.test(original))) continue;
      const partes = [formaDe(texto.slice(fichas[i].inicio, fichas[i].fin))];
      if (ventana === 2) partes.push(formaDe(texto.slice(fichas[i + 1].inicio, fichas[i + 1].fin)));
      const corregido = candidatoCercano(partes, glosario);
      if (!corregido || corregido === original) continue;
      reemplazos.push({ inicio: fichas[i].inicio, fin: fichas[ultima].fin, forma: corregido });
      cambios.push({ original, corregido }); avanzar = ventana; break;
    }
    i += avanzar;
  }
  if (reemplazos.length === 0) return { texto, cambios };
  const trozos: string[] = [];
  let cursor = 0;
  for (const r of reemplazos) { trozos.push(texto.slice(cursor, r.inicio), r.forma); cursor = r.fin; }
  trozos.push(texto.slice(cursor));
  return { texto: trozos.join(""), cambios };
}
