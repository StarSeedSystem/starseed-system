import { canalPara } from '../politica-acceso'
import { describe, it, expect } from 'vitest'

interface EntradaReferencia {
  id: string
  nombre: string
  canales: string[]
  prohibido?: string[]
  [key: string]: unknown
}

describe('canalPara', () => {
  const ahora = Date.now()

  const entradaBase: EntradaReferencia = {
    id: 'test',
    nombre: 'Entrada de prueba',
    canales: ['mcp-oficial', 'api-oficial', 'sitemap', 'navegador-de-la-persona'],
    prohibido: []
  }

  it('debe elegir canal oficial conectado', () => {
    const conectado = new Set<string>(['mcp-oficial'])
    const resultado = canalPara(entradaBase, { accion: 'buscar', conectado, ahora })
    expect(resultado.canal).toBe('mcp-oficial')
    expect(resultado.permitido).toBe(true)
    expect(resultado.motivo).toBe('Canal oficial conectado')
    expect(resultado.agenteUsuario).toBe('StarSeedOS-Astraura/1.0 (+https://github.com/StarSeedSystem)')
    expect(resultado.pausaMs).toBe(0)
    expect(resultado.cacheMaxMs).toBe(0)
  })

  it('debe elegir canal oficial api cuando mcp no está conectado', () => {
    const conectado = new Set<string>(['api-oficial'])
    const resultado = canalPara(entradaBase, { accion: 'buscar', conectado, ahora })
    expect(resultado.canal).toBe('api-oficial')
    expect(resultado.permitido).toBe(true)
    expect(resultado.motivo).toBe('Canal oficial conectado')
    expect(resultado.agenteUsuario).toBe('StarSeedOS-Astraura/1.0 (+https://github.com/StarSeedSystem)')
  })

  it('debe elegir sitemap cuando no hay oficiales conectados', () => {
    const conectado = new Set<string>()
    const resultado = canalPara(entradaBase, { accion: 'buscar', conectado, ahora })
    expect(resultado.canal).toBe('sitemap')
    expect(resultado.permitido).toBe(true)
    expect(resultado.motivo).toBe('Canal sitemap/páginas')
    expect(resultado.agenteUsuario).toBe('StarSeedOS-Astraura/1.0 (+https://github.com/StarSeedSystem)')
    expect(resultado.pausaMs).toBe(3000)
    expect(resultado.cacheMaxMs).toBe(0)
  })

  it('debe elegir navegador de la persona cuando no hay oficiales ni sitemap', () => {
    const conectado = new Set<string>()
    const entradaSinSitemap: EntradaReferencia = {
      ...entradaBase,
      canales: ['mcp-oficial', 'api-oficial', 'navegador-de-la-persona']
    }
    const resultado = canalPara(entradaSinSitemap, { accion: 'buscar', conectado, ahora })
    expect(resultado.canal).toBe('navegador-de-la-persona')
    expect(resultado.permitido).toBe(true)
    expect(resultado.motivo).toBe('Navegador de la persona')
    expect(resultado.agenteUsuario).toBe('')
    expect(resultado.pausaMs).toBe(0)
    expect(resultado.cacheMaxMs).toBe(0)
  })

  it('debe ajustar pausaMs para sitemap cuando prohibido incluye menos-de-10-s-entre-peticiones', () => {
    const conectado = new Set<string>()
    const entradaConProhibido: EntradaReferencia = {
      ...entradaBase,
      prohibido: ['menos-de-10-s-entre-peticiones']
    }
    const resultado = canalPara(entradaConProhibido, { accion: 'buscar', conectado, ahora })
    expect(resultado.pausaMs).toBe(10000)
  })

  it('debe mantener pausaMs en 3000 para sitemap cuando prohibido no tiene la restricción', () => {
    const conectado = new Set<string>()
    const entradaSinProhibido: EntradaReferencia = {
      ...entradaBase,
      prohibido: ['scraping', 'descarga-masiva']
    }
    const resultado = canalPara(entradaSinProhibido, { accion: 'buscar', conectado, ahora })
    expect(resultado.pausaMs).toBe(3000)
  })

  it('debe calcular cacheMaxMs a partir de prohibido cache-mas-de-24h', () => {
    const conectado = new Set<string>()
    const entradaConCache: EntradaReferencia = {
      ...entradaBase,
      prohibido: ['cache-mas-de-24h']
    }
    const resultado = canalPara(entradaConCache, { accion: 'buscar', conectado, ahora })
    expect(resultado.cacheMaxMs).toBe(24 * 3600 * 1000)
  })

  it('debe devolver 0 para cacheMaxMs cuando no hay prohibido de caché', () => {
    const conectado = new Set<string>()
    const resultado = canalPara(entradaBase, { accion: 'buscar', conectado, ahora })
    expect(resultado.cacheMaxMs).toBe(0)
  })

  it('debe tratar todas las acciones de manera similar para permisos básicos', () => {
    const conectado = new Set<string>(['mcp-oficial'])
    const acciones = ['buscar', 'leer-pagina', 'instalar']
    const resultados = acciones.map((accion) => canalPara(entradaBase, { accion, conectado, ahora }))

    for (const resultado of resultados) {
      expect(resultado.canal).toBe('mcp-oficial')
      expect(resultado.permitido).toBe(true)
      expect(resultado.pausaMs).toBe(0)
      expect(resultado.cacheMaxMs).toBe(0)
    }
  })

  it('debe elegir el primer oficial conectado según el orden de canales de la entrada', () => {
    const conectado = new Set<string>(['mcp-oficial', 'api-oficial'])
    const entradaApiPrimero: EntradaReferencia = {
      ...entradaBase,
      canales: ['api-oficial', 'mcp-oficial', 'navegador-de-la-persona']
    }
    const resultado = canalPara(entradaApiPrimero, { accion: 'buscar', conectado, ahora })
    expect(resultado.canal).toBe('api-oficial')
  })

  it('debe caer al primer canal listado cuando no hay oficiales, sitemap ni navegador', () => {
    const conectado = new Set<string>()
    const entradaSoloOficiales: EntradaReferencia = {
      ...entradaBase,
      canales: ['mcp-oficial', 'api-oficial']
    }
    const resultado = canalPara(entradaSoloOficiales, { accion: 'buscar', conectado, ahora })
    expect(resultado.canal).toBe('mcp-oficial')
    expect(resultado.motivo).toBe('Primer canal disponible (configuración por defecto)')
    expect(resultado.agenteUsuario).toBe('')
    expect(resultado.pausaMs).toBe(0)
    expect(resultado.cacheMaxMs).toBe(0)
  })

  it('debe ignorar mayúsculas/minúsculas en canal sitemap', () => {
    const conectado = new Set<string>()
    const entradaConSitemapMayusculas: EntradaReferencia = {
      ...entradaBase,
      canales: ['MCP-OFICIAL', 'SITEMAP', 'NAVEGADOR-DE-LA-PERSONA']
    }
    const resultado = canalPara(entradaConSitemapMayusculas, { accion: 'buscar', conectado, ahora })
    expect(resultado.canal).toBe('SITEMAP')
    expect(resultado.motivo).toBe('Canal sitemap/páginas')
  })
})