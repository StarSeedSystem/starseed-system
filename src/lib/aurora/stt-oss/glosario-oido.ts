"use client";

/**
 * StarSeed OS - Corrector por glosario de nombres propios para STT
 * Corrige formas cercanas de nombres propios usando distancia de edición normalizada
 * Módulo puro (sin efectos secundarios, sin red ni disco).
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
 * Normaliza una string eliminando espacios y convirtiendo a minúsculas
 */
function normalizar(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * Obtiene la lista básica de glosario (nombres propios del sistema)
 */
export function glosarioBase(): string[] {
  return [
    "Astraura",
    "StarSeed",
    "Genesis",
    "MetaGenesis",
    "PoliGenesis",
    "ProtoGenesis",
    "Aurora",
    "Hermes",
  ];
}

const PALABRAS_COMUNES: Record<string, string[]> = {
  es: ["star", "said", "sed", "estora", "astora", "or", "la", "el", "los", "las", "un", "una", "y", "o", "pero", "si", "no"],
  en: ["star", "said", "sed", "estora", "astora", "or", "the", "a", "an", "and", "or", "but", "if", "not", "to", "of", "in", "on", "at", "for", "with", "by"],
};

/**
 * Corrige texto usando un glosario de nombres propios
 * @param texto Texto original a corregir
 * @param glosario Lista de nombres propios válidos
 * @param idioma Idioma del texto ('es' o 'en')
 * @returns Objeto con el texto corregido y lista de cambios realizados
 */
export function corregirConGlosario(
  texto: string,
  glosario: string[],
  idioma: string = "es"
): { texto: string; cambios: string[] } {
  if (!texto.trim()) {
    return { texto, cambios: [] };
  }

  const palabras = texto.split(/\s+/);
  const palabrasCorregidas: string[] = [];
  const cambios: string[] = [];

  let i = 0;
  while (i < palabras.length) {
    let corregido = false;
    let palabrasConsumidas = 1;
    let sugerencia: string | null = null;
    let mejorDistancia = Infinity;

    if (i + 1 < palabras.length) {
      const palabra1 = palabras[i];
      const palabra2 = palabras[i + 1];
      const dosPalabras = palabra1 + " " + palabra2;
      const dosPalabrasNormalizadas = normalizar(dosPalabras);
      const tieneMayuscula = /[A-ZÁÉÍÓÚÜÑ]/.test(dosPalabras);

      if (tieneMayuscula) {
        let mejorDistanciaPar = Infinity;
        let sugerenciaPar: string | null = null;

        for (const candidato of glosario) {
          const candidatoNormalizado = normalizar(candidato);
          const distancia = distanciaEdicion(dosPalabrasNormalizadas, candidatoNormalizado);
          const longitudReferencia = Math.max(dosPalabrasNormalizadas.length, candidatoNormalizado.length);
          const distanciaNormalizada = longitudReferencia > 0 ? distancia / longitudReferencia : 0;
          const diffCaracteres = Math.abs(dosPalabrasNormalizadas.length - candidatoNormalizado.length);

          // Solo considerar par si la diferencia de caracteres es pequeña (≤ 1)
          // para evitar corregir obvious typos como "Starra Seed" -> "StarSeed"
          if (diffCaracteres <= 1 && distanciaNormalizada <= 0.34) {
            if (distanciaNormalizada < mejorDistanciaPar - 0.05) {
              mejorDistanciaPar = distanciaNormalizada;
              sugerenciaPar = candidato;
            } else if (Math.abs(distanciaNormalizada - mejorDistanciaPar) <= 0.05) {
              const candidatoActualLen = candidatoNormalizado.length;
              const sugerenciaActualLen = sugerenciaPar ? normalizar(sugerenciaPar).length : 0;
              if (candidatoActualLen > sugerenciaActualLen) {
                mejorDistanciaPar = distanciaNormalizada;
                sugerenciaPar = candidato;
              }
            }
          }
        }

        if (sugerenciaPar !== null) {
          palabrasCorregidas.push(sugerenciaPar);
          cambios.push(`${dosPalabras} → ${sugerenciaPar}`);
          corregido = true;
          palabrasConsumidas = 2;
        }
      }
    }

    if (!corregido) {
      const unaPalabra = palabras[i];
      const unaPalabraNormalizada = normalizar(unaPalabra);
      const tieneMayuscula = /[A-ZÁÉÍÓÚÜÑ]/.test(unaPalabra);
      const esPalabraComun = PALABRAS_COMUNES[idioma]?.includes(unaPalabraNormalizada) || false;

      if (tieneMayuscula || !esPalabraComun) {
        mejorDistancia = Infinity;
        for (const candidato of glosario) {
          const candidatoNormalizado = normalizar(candidato);
          const distancia = distanciaEdicion(unaPalabraNormalizada, candidatoNormalizado);
          const longitudReferencia = Math.max(unaPalabraNormalizada.length, candidatoNormalizado.length);
          const distanciaNormalizada = longitudReferencia > 0 ? distancia / longitudReferencia : 0;
          if (distanciaNormalizada <= 0.50) {
            if (distanciaNormalizada < mejorDistancia - 0.05) {
              mejorDistancia = distanciaNormalizada;
              sugerencia = candidato;
            } else if (Math.abs(distanciaNormalizada - mejorDistancia) <= 0.05) {
              const candidatoActualLen = candidatoNormalizado.length;
              const sugerenciaActualLen = sugerencia ? normalizar(sugerencia).length : 0;
              if (candidatoActualLen > sugerenciaActualLen) {
                mejorDistancia = distanciaNormalizada;
                sugerencia = candidato;
              }
            }
          }
        }
        if (sugerencia !== null) {
          palabrasCorregidas.push(sugerencia);
          cambios.push(`${unaPalabra} → ${sugerencia}`);
          corregido = true;
          palabrasConsumidas = 1;
        }
      }
    }

    if (!corregido) {
      palabrasCorregidas.push(palabras[i]);
      palabrasConsumidas = 1;
    }

    i += palabrasConsumidas;
  }

  const textoCorregido = palabrasCorregidas.join(" ");
  return { texto: textoCorregido, cambios };
}