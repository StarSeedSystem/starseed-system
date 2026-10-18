// Tipos para el catálogo de referencias e inspiración
export type Formato = 'starseed-referencias';
export type Version = 1;
export type Verificado = string; // formato de fecha YYYY-MM-DD
export type Origen = string;

export type TemaReferencia = {
  id: string;
  nombre: string;
  icono: string;
};

export type EntradaReferencia = {
  id: string;
  nombre: string;
  url: string; // debe ser HTTPS
  tema: string; // debe existir en los temas
  subtema: string | null;
  que_es: string;
  tipo: string;
  acceso: 'libre' | 'registro' | 'pago' | 'mixto';
  clase_uso: 'reutilizable' | 'reutilizable-con-condiciones' | 'solo-referencia' | 'solo-enlace';
  condiciones: string;
  canales: Array<string>; // validados contra CANALES_VALIDOS
  prohibido: Array<string>;
  actualizacion: Array<{
    tipo: string;
    ref?: string;
    url?: string;
    nota?: string;
  }>;
  integracion: Array<{
    tipo: string;
    url?: string;
    ref?: string;
    nombre?: string;
    licencia?: string;
    requiere?: string;
  }>;
  terminos: string | null;
  og_imagen: string | null;
  verificado: string; // formato de fecha YYYY-MM-DD
  sin_verificar: Array<string>;
};

export type Catalogo = {
  formato: Formato;
  version: Version;
  verificado: Verificado;
  origen: Origen;
  temas: TemaReferencia[];
  entradas: EntradaReferencia[];
};

// Canales válidos extraídos del JSON de referencia
export const CANALES_VALIDOS: Readonly<Array<string>> = [
  'mcp-oficial',
  'cli-oficial',
  'navegador-de-la-persona',
  'lectura-puntual',
  'oembed',
  'github',
  'skill',
  'script',
  'hash-html',
  'youtube-canal',
  'api-docs-publica',
  'sitemap-respetando-robots',
  'rss',
  'api-oficial',
  'changelog',
  'sitemap',
  'sitemap-lastmod',
  'sitemap-parcial',
  'blog',
  'api',
  'figma-plugin',
  'plugin',
  'extension',
  'descarga-oficial',
  'pagina',
  'css',
] as const;

// Resultado de la validación
export type ResultadoValidacion =
  | { ok: true; catalogo: Catalogo }
  | { ok: false; motivos: string[] };

/**
 * Valida el catálogo de referencias e inspiración.
 * @param json Objeto JSON parseado
 * @returns Resultado de la validación
 */
export function validarCatalogo(json: unknown): ResultadoValidacion {
  // Implementación pendiente
  return { ok: false, motivos: ['Función no implementada'] };
}