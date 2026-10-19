import { iniciales } from '../../contactos/modelo';

// Trinity colors HSL values from src/app/globals.css :root block
const TRINITY_COLORS = [
  'hsl(210 100% 50%)',   // azure
  'hsl(111 100% 54%)',   // lime
  'hsl(160 84% 39%)',    // emerald
  'hsl(45 100% 50%)',    // amber
  'hsl(348 83% 47%)',    // crimson
  'hsl(187 92% 55%)',    // cyan
  'hsl(300 85% 60%)',    // magenta
  'hsl(276 85% 55%)',    // violet
  'hsl(340 90% 62%)',    // rose
  'hsl(240 80% 62%)',    // indigo
] as const;

// Mapping from entrada tipo to Lucide icon name
const TIPO_TO_ICONO: Record<string, string> = {
  'herramienta-ia': 'Brain',
  'codigo-abierto': 'Code',
  'guia-principios': 'BookOpen',
  'comunidad-curso': 'Users',
  'recursos-descargables': 'Download',
  'galeria-inspiracion': 'Image',
  'otro': 'HelpCircle',
};

/**
 * Hash function (DJB2) to get a number from a string.
 */
function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash + str.charCodeAt(i); // hash * 33 + char
  }
  return hash >>> 0; // Convert to unsigned 32-bit integer
}

/**
 * Generates a portada (gradient, initials, icon) for a given entrada.
 * @param entrada - The entrada object from the catalog.
 * @returns An object with degradado (two HSL colors), iniciales, and icono (Lucide icon name).
 */
export function portadaGenerada(entrada: {
  nombre: string;
  tipo: string;
  url: string;
}): {
  degradado: [string, string];
  iniciales: string;
  icono: string;
} {
  // Derive two colors from the domain (url) using hash
  const hash = hashString(entrada.url);
  const idx1 = Math.abs(hash) % TRINITY_COLORS.length;
  const idx2 = Math.abs(hash + TRINITY_COLORS.length / 2) % TRINITY_COLORS.length;
  const color1 = TRINITY_COLORS[idx1];
  const color2 = TRINITY_COLORS[idx2];

  // Get initials from the nombre
  const ini = iniciales(entrada.nombre);

  // Get icon from tipo
  const icono = TIPO_TO_ICONO[entrada.tipo] ?? 'HelpCircle'; // fallback

  return {
    degradado: [color1, color2] as [string, string],
    iniciales: ini,
    icono: icono,
  };
}

/**
 * Returns the og_imagen only if the persona opened the tarjeta and the entrada does not prohibit caching.
 * @param entrada - The entrada object from the catalog.
 * @param abierta - Whether the persona opened the tarjeta.
 * @returns The og_imagen string or null.
 */
export function portadaRemota(entrada: {
  og_imagen: string | null;
  prohibido: string[];
}, abierta: boolean): string | null {
  if (!abierta) {
    return null;
  }
  // Check if any prohibido item contains 'cache' (case-insensitive)
  const tieneProhibidoCache = entrada.prohibido.some((p) =>
    p.toLowerCase().includes('cache')
  );
  if (tieneProhibidoCache) {
    return null;
  }
  return entrada.og_imagen ?? null;
}