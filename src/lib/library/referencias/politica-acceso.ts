export function canalPara(
  entrada: { canales: string[]; prohibido?: string[]; [key: string]: unknown },
  { accion, conectado, ahora }: { accion: string; conectado: Set<string>; ahora: number }
) {
  const canalesOficiales = ['mcp-oficial', 'api-oficial']
  for (const canal of entrada.canales) {
    if (canalesOficiales.includes(canal) && conectado.has(canal)) {
      return {
        canal,
        permitido: true,
        motivo: 'Canal oficial conectado',
        pausaMs: obtenerPausaMs(entrada, canal),
        cacheMaxMs: obtenerCacheMaxMs(entrada, canal),
        agenteUsuario: 'StarSeedOS-Astraura/1.0 (+https://github.com/StarSeedSystem)'
      }
    }
  }
  for (const canal of entrada.canales) {
    if (canal.toLowerCase().includes('sitemap')) {
      return {
        canal,
        permitido: true,
        motivo: 'Canal sitemap/páginas',
        pausaMs: obtenerPausaMsSitemap(entrada),
        cacheMaxMs: obtenerCacheMaxMs(entrada, canal),
        agenteUsuario: 'StarSeedOS-Astraura/1.0 (+https://github.com/StarSeedSystem)'
      }
    }
  }
  const canalFallback = 'navegador-de-la-persona'
  if (entrada.canales.includes(canalFallback)) {
    return {
      canal: canalFallback,
      permitido: true,
      motivo: 'Navegador de la persona',
      pausaMs: 0,
      cacheMaxMs: 0,
      agenteUsuario: ''
    }
  }
  const primerCanal = entrada.canales[0]
  return {
    canal: primerCanal,
    permitido: true,
    motivo: 'Primer canal disponible (configuración por defecto)',
    pausaMs: 0,
    cacheMaxMs: 0,
    agenteUsuario: ''
  }
}

function obtenerPausaMs(entrada: { prohibido?: string[]; [key: string]: unknown }, canal: string): number {
  return 0
}

function obtenerPausaMsSitemap(entrada: { prohibido?: string[]; [key: string]: unknown }): number {
  const prohibido = entrada.prohibido ?? []
  if (prohibido.includes('menos-de-10-s-entre-peticiones')) {
    return 10000
  }
  return 3000
}

function obtenerCacheMaxMs(entrada: { prohibido?: string[]; [key: string]: unknown }, _canal: string): number {
  const prohibido = entrada.prohibido ?? []
  for (const p of prohibido) {
    const match = p.match(/cache-mas-de-(\d+)(h|d)/)
    if (match) {
      const numero = parseInt(match[1], 10)
      const unidad = match[2]
      if (unidad === 'h') {
        return numero * 3600 * 1000
      }
      if (unidad === 'd') {
        return numero * 24 * 3600 * 1000
      }
    }
  }
  return 0
}