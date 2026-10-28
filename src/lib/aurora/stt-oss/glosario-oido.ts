/**
 * Corrector por glosario de nombres propios para STT
 * Corrige formas cercanas de nombres propios usando distancia de edición normalizada
 * Módulo puro: entrada → salida, sin red ni efectos secundarios
 */

/**
 * Calcula la distancia de edición (Levenshtein) entre dos strings
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
 * Normaliza una cadena eliminando espacios y convirtiendo a minúsculas
 */
function normalizar(s: string): string {
  return s.replace(/\s+/g, "").toLowerCase();
}

/**
 * Lista básica de nombres propios del sistema
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

/**
 * Palabras frecuentes que no deben corregirse si están en minúsculas
 */
const PALABRAS_COMUNES: Record<string, string[]> = {
  es: ["star", "said", "sed", "estora", "astora", "or", "la", "el", "los", "las", "un", "una", "y", "o", "pero", "si", "no"],
  en: ["star", "said", "sed", "estora", "astora", "or", "the", "a", "an", "and", "or", "but", "if", "not", "to", "of", "in", "on", "at", "for", "with", "by"],
};

/**
 * Corrige texto usando glosario de nombres propios
 * @param texto Texto a corregir
 * @param glosario Lista de nombres propios válidos
 * @param idioma Idioma del texto ('es' o 'en')
 * @returns Texto corregido y lista de cambios realizados
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
  const resultado: string[] = [];
  const cambios: string[] = [];

  let i = 0;
  while (i < palabras.length) {
    let palabrasConsumidas = 1;
    let corregido = false;
    let intentoPar = false;

    // Intentar corregir par de palabras
    if (i + 1 < palabras.length) {
      const palabra1 = palabras[i];
      const palabra2 = palabras[i + 1];
      const par = `${palabra1} ${palabra2}`;
      const tieneMayuscula = /[A-ZÁÉÍÓÚÜÑ]/.test(par);
      
      if (tieneMayuscula) {
        intentoPar = true;
        let mejorCandidato: string | null = null;
        let mejorDistancia = Infinity;

        for (const candidato of glosario) {
          const normalizadoPar = normalizar(par);
          const normalizadoCandidato = normalizar(candidato);
          const distancia = distanciaEdicion(normalizadoPar, normalizadoCandidato);
          const longitudReferencia = Math.max(normalizadoPar.length, normalizadoCandidato.length);
          const distanciaNormalizada = longitudReferencia > 0 ? distancia / longitudReferencia : 0;
          const diffCaracteres = Math.abs(normalizadoPar.length - normalizadoCandidato.length);

          if (diffCaracteres <= 1 && distanciaNormalizada <= 0.34) {
            if (distanciaNormalizada < mejorDistancia - 0.05) {
              mejorDistancia = distanciaNormalizada;
              mejorCandidato = candidato;
            } else if (Math.abs(distanciaNormalizada - mejorDistancia) <= 0.05) {
              const candidatoActualLen = normalizadoCandidato.length;
              const sugerenciaActualLen = mejorCandidato ? normalizar(mejorCandidato).length : 0;
              if (candidatoActualLen > sugerenciaActualLen) {
                mejorDistancia = distanciaNormalizada;
                mejorCandidato = candidato;
              }
            }
          }
        }

        if (mejorCandidato) {
          resultado.push(mejorCandidato);
          cambios.push(`${par} → ${mejorCandidato}`);
          palabrasConsumidas = 2;
          corregido = true;
        }
      }
    }

    // Intentar corregir palabra individual
    if (!corregido && !intentoPar) {
      const palabra = palabras[i];
      const normalizada = normalizar(palabra);
      const tieneMayuscula = /[A-ZÁÉÍÓÚÜÑ]/.test(palabra);
      const esPalabraComun = PALABRAS_COMUNES[idioma]?.includes(normalizada) || false;

      if (tieneMayuscula || !esPalabraComun) {
        let mejorCandidato: string | null = null;
        let mejorDistancia = Infinity;

        for (const candidato of glosario) {
          const normalizadoCandidato = normalizar(candidato);
          const distancia = distanciaEdicion(normalizada, normalizadoCandidato);
          const longitudReferencia = Math.max(normalizada.length, normalizadoCandidato.length);
          const distanciaNormalizada = longitudReferencia > 0 ? distancia / longitudReferencia : 0;
          const diffCaracteres = Math.abs(normalizada.length - normalizadoCandidato.length);

          if (distanciaNormalizada <= 0.50 && diffCaracteres <= 3) {
            if (distanciaNormalizada < mejorDistancia - 0.05) {
              mejorDistancia = distanciaNormalizada;
              mejorCandidato = candidato;
            } else if (Math.abs(distanciaNormalizada - mejorDistancia) <= 0.05) {
              const candidatoActualLen = normalizadoCandidato.length;
              const sugerenciaActualLen = mejorCandidato ? normalizar(mejorCandidato).length : 0;
              if (candidatoActualLen > sugerenciaActualLen) {
                mejorDistancia = distanciaNormalizada;
                mejorCandidato = candidato;
              }
            }
          }
        }

        if (mejorCandidato) {
          resultado.push(mejorCandidato);
          cambios.push(`${palabra} → ${mejorCandidato}`);
          corregido = true;
        }
      }
    }

    // Si no se corrigió, mantener original
    if (!corregido) {
      resultado.push(palabras[i]);
    }

    i += palabrasConsumidas;
  }

  return { texto: resultado.join(" "), cambios };
}
