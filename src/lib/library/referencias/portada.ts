import { ReferenciaEntrada } from './types';

// Mapeo de tema a icono (extraído de config/referencias-inspiracion.json)
const TEMAS_ICONOS: Record<string, string> = {
  'ia-diseno': 'Sparkles',
  guias: 'BookOpen',
  movimiento: 'Wind',
  marca: 'Gem',
  'tipografia-iconos': 'Type',
  'inspiracion-ui': 'LayoutGrid',
  reglas: 'Ruler',
};

// Lista de colores StarSeed para el degradado (determinista por dominio)
const COLORES_STARSEED = [
  '#007FFF', // zenith
  '#10B981', // horizonte
  '#FFBF00', // logica
  '#DC143C', // base
  '#F8F9FA', // neutro
  '#00F0FF', // Astraura ciano
  '#22D3EE', // Genesis cian
  '#A78BFA', // Genesis violeta
  '#FBBF24', // Genesis ambar
];

/**
 * Extrae el hostname de una URL.
 * @param url URL completa
 * @returns hostname en minúsculas o cadena vacía si falla
 */
function obtenerHostname(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Hash simple tipo djb2 para strings.
 * @param str string a hashear
 * @returns número entero positivo
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i); // hash * 33 + c
  }
  return hash >>> 0; // convertir a unsigned 32-bit
}

/**
 * Obtiene dos colores deterministas de la lista basado en el hostname.
 * @param hostname hostname de la URL
 * @returns tupla de dos colores hexadecimales
 */
function obtenerDegradadoPorDominio(hostname: string): [string, string] {
  if (!hostname) {
    return [COLORES_STARSEED[0], COLORES_STARSEED[1]];
  }
  const hash = hashString(hostname);
  const indice1 = hash % COLORES_STARSEED.length;
  const indice2 = (hash + Math.floor(hash / COLORES_STARSEED.length)) % COLORES_STARSEED.length;
  // Asegurar que los índices sean diferentes
  const idx2 = indice1 === indice2 ? (indice2 + 1) % COLORES_STARSEED.length : indice2;
  return [COLORES_STARSEED[indice1], COLORES_STARSEED[idx2]];
}

/**
 * Obtiene las iniciales de un nombre (primer letra de cada palabra, en mayúsculas).
 * Si hay una sola palabra, toma las dos primeras letras de esa palabra.
 * @param nombre string de nombre
 * @returns iniciales (exactamente 2 caracteres, o '??' si no se pueden obtener)
 */
function obtenerIniciales(nombre: string): string {
  if (!nombre || nombre.trim() === '') {
    return '??';
  }
  const trimmed = nombre.trim();
  const palabras = trimmed.split(/\s+/);
  if (palabras.length === 1) {
    // Una sola palabra: tomar las dos primeras letras (o lo que haya)
    const primerasDos = trimmed.substring(0, 2);
    return primerasDos.length === 2 ? primerasDos.toUpperCase() : (primerasDos + '?').toUpperCase();
  }
  // Dos o más palabras: tomar la primera letra de cada palabra
  const iniciales = palabras
    .map(pal => pal[0])
    .filter(char => char !== undefined)
    .join('')
    .toUpperCase();
  // Siempre devolvemos exactamente dos caracteres
  if (iniciales.length >= 2) {
    return iniciales.substring(0, 2);
  }
  // Si solo tenemos una inicial (p.ej., dos palabras pero una está vacía?), rellenamos con '?'
  if (iniciales.length === 1) {
    return iniciales + '?';
  }
  // Si no tenemos iniciales (impossible aquí), devolvemos '??'
  return '??';
}

/**
 * Comprueba si la entrada tiene prohibido el caché.
 * @param prohibitedArray array de strings prohibidos
 * @returns true si incluye 'caché' (con acento)
 */
 function estaProhibidoCache(prohibitedArray: string[]): boolean {
  return prohibitedArray.includes('caché');
}

// Función pura que genera los datos de la portada a partir de una entrada
export function portadaGenerada(entrada: ReferenciaEntrada): {
  degradado: [string, string];
  iniciales: string;
  icono: string;
} {
  const hostname = obtenerHostname(entrada.url);
  const degradado = obtenerDegradadoPorDominio(hostname);
  const iniciales = obtenerIniciales(entrada.nombre);
  const icono = TEMAS_ICONOS[entrada.tema] || 'Sparkles'; // fallback
  return {
    degradado,
    iniciales,
    icono,
  };
}

// Función pura que devuelve la imagen og si la tarjeta está abierta y no está prohibido caché
export function portadaRemota(entrada: ReferenciaEntrada, abierta: boolean): string | null {
  if (!abierta) {
    return null;
  }
  if (estaProhibidoCache(entrada.prohibido)) {
    return null;
  }
  // Para videos de YouTube, usar dominio nocookie en la og_imagen si aplica
  let ogImagen = entrada.og_imagen;
  if (ogImagen && entrada.url.includes('youtube.com/watch?v=')) {
    // Convertir og_imagen de YouTube a dominio nocookie para thumbnails
    // Reemplazar i.ytimg.com con img.youtube.com (alternativa sin cookies)
    ogImagen = ogImagen.replace('i.ytimg.com', 'img.youtube.com');
  }
  return ogImagen;
}