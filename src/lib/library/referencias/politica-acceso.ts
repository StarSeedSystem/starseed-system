import { type EntradaReferencia } from '../../tipos/referencias';

/**
 * Determina el canal a utilizar para acceder a una referencia según su política de acceso.
 * @param entrada - La entrada de referencia del catálogo.
 * @param params - Parámetros de contexto: acción, canales conectados y timestamp actual.
 * @returns Objeto con la configuración del canal.
 */
export function canalPara(
  entrada: EntradaReferencia,
  { accion, conectado, ahora }: { accion: string; conectado: Set<string>; ahora: number }
) {
  // Canales oficiales que requieren conexión
  const canalesOficiales = ['mcp-oficial', 'api-oficial'];

  // Buscar primero un canal oficial conectado
  for (const canal of entrada.canales) {
    if (canalesOficiales.includes(canal) && conectado.has(canal)) {
      return {
        canal,
        permitido: true,
        motivo: 'Canal oficial conectado',
        pausaMs: obtenerPausaMs(entrada, canal),
        cacheMaxMs: obtenerCacheMaxMs(entrada, canal),
        agenteUsuario: 'StarSeedOS-Astraura/1.0 (+https://github.com/StarSeedSystem)'
      };
    }
  }

  // Buscar un canal de sitemap/páginas
  for (const canal of entrada.canales) {
    if (canal.toLowerCase().includes('sitemap')) {
      return {
        canal,
        permitido: true,
        motivo: 'Canal sitemap/páginas',
        pausaMs: obtenerPausaMsSitemap(entrada),
        cacheMaxMs: obtenerCacheMaxMs(entrada, canal),
        agenteUsuario: 'StarSeedOS-Astraura/1.0 (+https://github.com/StarSeedSystem)'
      };
    }
  }

  // Fallback: usar el navegador de la persona (asumimos que está en entrada.canales)
  const canalFallback = 'navegador-de-la-persona';
  // Verificar si el fallback está en los canales (por seguridad)
  if (entrada.canales.includes(canalFallback)) {
    return {
      canal: canalFallback,
      permitido: true,
      motivo: 'Navegador de la persona',
      pausaMs: 0,
      cacheMaxMs: 0,
      agenteUsuario: ''
    };
  }

  // Si por alguna razón no está el fallback, usamos el primer canal disponible con configuración mínima
  const primerCanal = entrada.canales[0];
  return {
    canal: primerCanal,
    permitido: true,
    motivo: 'Primer canal disponible (configuración por defecto)',
    pausaMs: 0,
    cacheMaxMs: 0,
    agenteUsuario: ''
  };
}

/**
 * Obtiene el tiempo de pausa en milisegundos basado en las prohibiciones de la entrada.
 * Para canales oficiales, buscamos restricciones de tiempo en las prohibiciones.
 */
function obtenerPausaMs(entrada: EntradaReferencia, canal: string): number {
  // Por defecto, sin pausa requerida
  return 0;
}

/**
 * Obtiene el tiempo de pausa en milisegundos específicamente para canales sitemap/páginas.
 * Si la entrada tiene prohibición de menos de 10 segundos entre peticiones, devuelve 10000 ms.
 * De lo contrario, devuelve 3000 ms.
 */
function obtenerPausaMsSitemap(entrada: EntradaReferencia): number {
  const prohibido = entrada.prohibido ?? [];
  if (prohibido.includes('menos-de-10-s-entre-peticiones')) {
    return 10000;
  }
  return 3000;
}

/**
 * Obtiene el tiempo máximo de caché en milisegundos basado en las prohibiciones de la entrada.
 * Busca patrones como 'cache-mas-de-24h' para establecer el límite máximo.
 */
function obtenerCacheMaxMs(entrada: EntradaReferencia, _canal: string): number {
  const prohibido = entrada.prohibido ?? [];
  for (const p of prohibido) {
    // Patrón: cache-mas-de-<número><h|d>
    const match = p.match(/cache-mas-de-(\d+)(h|d)/);
    if (match) {
      const numero = parseInt(match[1], 10);
      const unidad = match[2];
      if (unidad === 'h') {
        return numero * 3600 * 1000;
      }
      if (unidad === 'd') {
        return numero * 24 * 3600 * 1000;
      }
    }
  }
  return 0;
}