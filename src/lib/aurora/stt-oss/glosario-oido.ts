"use client";

/**
 * StarSeed OS - Corrector por glosario de nombres propios para STT
 * Corrige formas cercanas de nombres propios usando distancia de edición normalizada
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
        matriz[i - 1][j] + 1, // eliminación
        matriz[i][j - 1] + 1, // inserción
        matriz[i - 1][j - 1] + costo // sustitución
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

/**
 * Lista de palabras comunes por idioma para evitar falsos positivos
 */
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
  // Si el texto está vacío, devolverlo tal cual
  if (!texto.trim()) {
    return { texto, cambios: [] };
  }

  // Dividir el texto en palabras
  const palabras = texto.split(/\s+/);
  const palabrasCorregidas: string[] = [];
  const cambios: string[] = [];

  for (const palabra of palabras) {
    // Normalizar la palabra para comparación
    const palabraNormalizada = normalizar(palabra);
    
    // Verificar si es una palabra común en el idioma (evitar falsos positivos)
    const esPalabraComun = PALABRAS_COMUNES[idioma]?.includes(palabraNormalizada) || false;
    
    if (esPalabraComun) {
      // Si es palabra común, no intentar corrección
      palabrasCorregidas.push(palabra);
      continue;
    }

    // Buscar la mejor coincidencia en el glosario
    let mejorCoincidencia: string | null = null;
    let menorDistanciaNormalizada = Infinity;

    for (const candidato of glosario) {
      const candidatoNormalizado = normalizar(candidato);
      
      // Calcular distancia de edición
      const distancia = distanciaEdicion(palabraNormalizada, candidatoNormalizado);
      
      // Normalizar distancia por la longitud de la forma sin espacios ni mayúsculas
      const longitudReferencia = Math.max(palabraNormalizada.length, candidatoNormalizado.length);
      const distanciaNormalizada = longitudReferencia > 0 ? distancia / longitudReferencia : 0;
      
      // Si la distancia normalizada es pequeña y es la mejor hasta ahora
      if (distanciaNormalizada <= 0.34 && distanciaNormalizada < menorDistanciaNormalizada) {
        menorDistanciaNormalizada = distanciaNormalizada;
        mejorCoincidencia = candidato;
      }
    }

    // Si se encontró una buena coincidencia, usarla; si no, mantener la original
    if (mejorCoincidencia !== null) {
      palabrasCorregidas.push(mejorCoincidencia);
      cambios.push(`${palabra} → ${mejorCoincidencia}`);
    } else {
      palabrasCorregidas.push(palabra);
    }
  }

  // Unir las palabras corregidas de nuevo en un texto
  const textoCorregido = palabrasCorregidas.join(" ");
  
  return { texto: textoCorregido, cambios };
}