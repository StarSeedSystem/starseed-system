/**
 * StarSeed OS — Corrector por glosario de nombres propios para el oído (STT).
 * Contrato: architecture/voz-fusionada-astraura.md §3.3 y §8 (oído · V), y
 * aurora-voz-motores.md («ninguna función de la capa lanza»). Módulo PURO:
 * sin DOM, sin red, sin disco, sin excepciones — entra texto, salen texto y cambios.
 *
 * Tras cualquier motor (Phonon-2, Parakeet v3, VibeASR 1.58, navegador…), cambia
 * una forma cercana por la del glosario solo si la distancia de edición
 * normalizada es pequeña (≤ 0,34 sobre la forma sin espacios ni mayúsculas,
 * JUNTANDO hasta dos palabras seguidas) y la forma original NO es una palabra
 * común del idioma (lista corta es/en para no romper «star», «said», «sed»…).
 *
 * Umbrales medidos el 2026-10-15 en el A1 (contrato §1): «Star Sed» 0,125 ·
 * «StarSead» 0,125 · «Star Said» 0,25 · «Astora» 0,375 · «Estora» 0,50. Por eso:
 * la forma unida de DOS palabras usa el 0,34 del contrato; una palabra SOLA con
 * mayúscula usa 0,50 (sin él, «Estora» y «Astora» nunca se corrigen); y una
 * minúscula difusa se considera palabra real del idioma (umbral 0,15) para no
 * morder sueltas como «estrella», «aura» o «stated» que distan 0,375–0,50.
 */

/**
 * Calcula la distancia de edición (Levenshtein) entre two strings
 */
function distanciaEdicion(a: string, b: string): number {
  const matriz = Array(a.length + 1)
    .fill(null)
    .map(() => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) {
    matriz[i][0] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matriz[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + costo
      );
    }
  }

  return matriz[a.length][b.length];
}

/**
 * Normaliza una forma: sin espacios (para unir hasta dos palabras seguidas) y
 * sin mayúsculas (la medición se hace sobre la forma plana).
 */
function normalizar(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * Separa un vocablo en puntuación previa, núcleo alfabético y puntuación que
 * sigue: «Astraura,» → preámbulo «», núcleo «Astraura», cola «,». La puntuación
 * no se compara (arruinaría la distancia) y al corregir se recoloca en su sitio.
 * Un vocablo sin letras ni números («—») da núcleo vacío y no se corrige.
 */
function separarToken(palabra: string): { preámbulo: string; núcleo: string; cola: string } {
  const empieza = palabra.search(/[\p{L}\p{N}]/u);
  if (empieza < 0) {
    return { preámbulo: "", núcleo: "", cola: "" };
  }
  let termina = empieza;
  for (const letra of palabra.matchAll(/[\p{L}\p{N}]/gu)) {
    termina = letra.index;
  }
  return {
    preámbulo: palabra.slice(0, empieza),
    núcleo: palabra.slice(empieza, termina + 1),
    cola: palabra.slice(termina + 1),
  };
}

/**
 * El glosario base de StarSeed, MÁS los nombres que se le pasen: el del usuario,
 * sus bots y su grupo (contrato §6 · «Palabras propias»).
 */
export function glosarioBase(otros: readonly string[] = []): string[] {
  const base = [
    "Astraura",
    "StarSeed",
    "Genesis",
    "MetaGenesis",
    "PoliGenesis",
    "ProtoGenesis",
    "Aurora",
    "Hermes",
  ];
  const resultado: string[] = [];
  const vistas = new Set<string>();
  for (const nombre of [...base, ...otros]) {
    const limpio = nombre.trim();
    if (!limpio) continue;
    const clave = normalizar(limpio);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    resultado.push(limpio);
  }
  return resultado;
}

/**
 * Palabras comunes del idioma: lista CORTA de palabras frecuentes de es/en.
 * Además de las medidas por la tarea («star», «said», «sed»), quedan las palabras
 * reales que caen a ≤ 0,5 de un nombre del glosario («estrella», «ostra», «mes»,
 * «stars», «started»…): sin ellas, una mayúscula a principio de frase las cambiaría.
 */
const PALABRAS_COMUNES: Record<string, readonly string[]> = {
  es: [
    "de", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "o", "u",
    "que", "qué", "con", "por", "para", "como", "pero", "si", "sí", "no", "sin",
    "me", "te", "se", "lo", "le", "mi", "tu", "su", "sus", "ya", "muy", "mas",
    "más", "son", "era", "ser", "ver", "star", "said", "sed", "seed", "sedes",
    "estrella", "ostra", "aura", "mes", "arena", "segura", "sacra", "otra",
    "otro", "estaré", "estaría",
  ],
  en: [
    "the", "a", "an", "and", "or", "but", "if", "not", "to", "of", "in", "on",
    "at", "for", "with", "by", "is", "are", "was", "were", "be", "this", "that",
    "it", "as", "from", "so", "me", "my", "you", "your", "star", "said", "sed",
    "seed", "seeds", "stars", "started", "starred", "stated", "stayed", "store",
    "street", "storage", "stress", "sorted", "sated", "hearts", "aura",
  ],
};

/**
 * Corrige texto usando un glosario de nombres propios.
 * @param texto Texto entregado por el oído, con o sin puntuación.
 * @param glosario Nombres propios válidos (base + glosarioBase(otros)).
 * @param idioma 'es' o 'en'; otro idioma actúa con una lista común vacía.
 * @returns El texto corregido y los cambios como «forma original → nombre».
 */
export function corregirConGlosario(
  texto: string,
  glosario: string[],
  idioma: string = "es"
): { texto: string; cambios: string[] } {
  if (!texto.trim()) {
    return { texto, cambios: [] };
  }

  const comunes = PALABRAS_COMUNES[idioma] ?? [];
  const palabras = texto.split(/\s+/);
  const palabrasFinales: string[] = [];
  const cambios: string[] = [];

  // Elige el nombre del glosario más cercano a una forma ya normalizada. La
  // ventana de empate (0,05) resuelve a favor del nombre más largo, que en el
  // glosario base es el específico («StarSeed» antes que su mitad).
  const elegir = (
    forma: string,
    umbral: number
  ): { nombre: string; distancia: number } | null => {
    let mejor: { nombre: string; distancia: number } | null = null;
    for (const candidato of glosario) {
      const delCandidato = normalizar(candidato);
      const distancia = distanciaEdicion(forma, delCandidato);
      const normalizada = distancia / Math.max(forma.length, delCandidato.length, 1);
      if (normalizada > umbral) continue;
      if (!mejor || normalizada < mejor.distancia - 0.05) {
        mejor = { nombre: candidato, distancia: normalizada };
      } else if (
        normalizada <= mejor.distancia + 0.05 &&
        delCandidato.length > normalizar(mejor.nombre).length
      ) {
        mejor = { nombre: candidato, distancia: normalizada };
      }
    }
    return mejor ?? null;
  };

  let i = 0;
  while (i < palabras.length) {
    let corregido = false;
    let palabrasConsumidas = 1;
    const conMayusculas = /[A-ZÁÉÍÓÚÜÑ]/;

    // PRIMERO la forma unida de DOS palabras seguidas («Star Sed» → StarSeed):
    // es el camino del contrato (≤ 0,34) y corresponde a los nombres propios que
    // llegan partidos. Sin corte extra de diferencia de caracteres: el gatillo
    // es la distancia, y «Starra Seed» (0,20) es un fallo medible, no una esquina.
    if (i + 1 < palabras.length) {
      const primero = separarToken(palabras[i]);
      const segundo = separarToken(palabras[i + 1]);
      const formaUnida = normalizar(primero.núcleo + segundo.núcleo);
      const conMayuscula = conMayusculas.test(primero.núcleo + segundo.núcleo);
      // Si alguno de los dos vocablos YA es el nombre exacto, no se une: el par
      // comía el artículo («the Astraura») o la palabra que sigue («Astraura
      // said» → «Astraura»), y ya se corrige sola sin tocar lo demás.
      const yaEsNombre = (núcleo: string) =>
        glosario.some((candidato) => normalizar(candidato) === normalizar(núcleo));
      const esNombreExacto = yaEsNombre(primero.núcleo) || yaEsNombre(segundo.núcleo);
      if (formaUnida && conMayuscula && !comunes.includes(formaUnida) && !esNombreExacto) {
        const mejorPar = elegir(formaUnida, 0.34);
        if (mejorPar) {
          palabrasFinales.push(primero.preámbulo + mejorPar.nombre + segundo.cola);
          cambios.push(`${palabras[i]} ${palabras[i + 1]} → ${mejorPar.nombre}`);
          corregido = true;
          palabrasConsumidas = 2;
        }
      }
    }

    // DESPUÉS cada palabra sola. Palabra común: no se toca aunque capitalice, ni
    // si un vecino con mayúscula sugiere un nombre partido (para no romper
    // «Seed» dentro de «Starra Seed», que ya decidió el camino del par).
    if (!corregido) {
      const token = separarToken(palabras[i]);
      const formaSola = normalizar(token.núcleo);
      const conMayuscula = conMayusculas.test(token.núcleo);
      const vecinaConMayuscula =
        (i > 0 && conMayusculas.test(palabras[i - 1])) ||
        (i + 1 < palabras.length && conMayusculas.test(palabras[i + 1]));
      const corregeSola =
        formaSola.length > 0 &&
        !comunes.includes(formaSola) &&
        !vecinaConMayuscula;
      if (corregeSola) {
        const mejorSola = elegir(formaSola, conMayuscula ? 0.50 : 0.15);
        if (mejorSola) {
          palabrasFinales.push(token.preámbulo + mejorSola.nombre + token.cola);
          cambios.push(`${palabras[i]} → ${mejorSola.nombre}`);
          corregido = true;
        }
      }
    }

    if (!corregido) {
      palabrasFinales.push(palabras[i]);
      palabrasConsumidas = 1;
    }
    i += palabrasConsumidas;
  }

  return { texto: palabrasFinales.join(" "), cambios };
}