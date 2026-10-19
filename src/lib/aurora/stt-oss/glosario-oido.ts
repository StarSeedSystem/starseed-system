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
 * Nota: Incluimos variantes para evitar corregir falsos positivos
 */
const PALABRAS_COMUNES: Record<string, string[]> = {
  es: ["star", "said", "sed", "or", "la", "el", "los", "las", "un", "una", "y", "o", "pero", "si", "no", "el", "la", "los", "las"],
  en: ["star", "said", "sed", "or", "the", "a", "an", "and", "or", "but", "if", "not", "to", "of", "in", "on", "at", "for", "with", "by"],
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

  let i = 0;
  while (i < palabras.length) {
    // Intentar corregir con 2 palabras primero (si está disponible)
    let corregido = false;
    let palabrasConsumidas = 1;
    let sugerencia: string | null = null;
    let mejorDistancia = Infinity;

    // Probar con 2 palabras si es posible
    if (i + 1 < palabras.length) {
      const palabra1 = palabras[i];
      const palabra2 = palabras[i + 1];
      const dosPalabras = palabra1 + " " + palabra2;
      const dosPalabrasNormalizadas = normalizar(dosPalabras);
      
      // Solo corregir si hay alguna mayúscula (indica nombre propio)
      const tieneMayuscula = /[A-ZÁÉÍÓÚÜÑ]/.test(dosPalabras);
      
      if (tieneMayuscula) {
        for (const candidato of glosario) {
          const candidatoNormalizado = normalizar(candidato);
          
          // Calcular distancia de edición
          const distancia = distanciaEdicion(dosPalabrasNormalizadas, candidatoNormalizado);
          
          // Normalizar distancia por la longitud de la forma sin espacios ni mayúsculas
          const longitudReferencia = Math.max(dosPalabrasNormalizadas.length, candidatoNormalizado.length);
          const distanciaNormalizada = longitudReferencia > 0 ? distancia / longitudReferencia : 0;
          
          // Buscar la mejor coincidencia
          if (distanciaNormalizada <= 0.50 && distanciaNormalizada < mejorDistancia) {
            mejorDistancia = distanciaNormalizada;
            sugerencia = candidato;
          }
        }
        
        if (sugerencia !== null) {
          palabrasCorregidas.push(sugerencia);
          cambios.push(`${dosPalabras} → ${sugerencia}`);
          corregido = true;
          palabrasConsumidas = 2;
        }
      }
    }
    
    // Si no se corrigió con 2 palabras, intentar con 1 palabra
    if (!corregido) {
      const unaPalabra = palabras[i];
      const unaPalabraNormalizada = normalizar(unaPalabra);
      
      // Solo corregir si hay alguna mayúscula o la palabra no es común
      const tieneMayuscula = /[A-ZÁÉÍÓÚÜÑ]/.test(unaPalabra);
      const esPalabraComun = PALABRAS_COMUNES[idioma]?.includes(unaPalabraNormalizada) || false;
      
      if (tieneMayuscula || !esPalabraComun) {
        mejorDistancia = Infinity;
        
        for (const candidato of glosario) {
          const candidatoNormalizado = normalizar(candidato);
          
          // Calcular distancia de edición
          const distancia = distanciaEdicion(unaPalabraNormalizada, candidatoNormalizado);
          
          // Normalizar distancia por la longitud de la forma sin espacios ni mayúsculas
          const longitudReferencia = Math.max(unaPalabraNormalizada.length, candidatoNormalizado.length);
          const distanciaNormalizada = longitudReferencia > 0 ? distancia / longitudReferencia : 0;
          
          // Buscar la mejor coincidencia
          if (distanciaNormalizada <= 0.50 && distanciaNormalizada < mejorDistancia) {
            mejorDistancia = distanciaNormalizada;
            sugerencia = candidato;
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
    
    // Si no se corrigió ni con 1 ni con 2 palabras, mantener la original
    if (!corregido) {
      palabrasCorregidas.push(palabras[i]);
      palabrasConsumidas = 1;
    }
    
    i += palabrasConsumidas;
  }

  // Unir las palabras corregidas de nuevo en un texto
  const textoCorregido = palabrasCorregidas.join(" ");
  
  return { texto: textoCorregido, cambios };
}