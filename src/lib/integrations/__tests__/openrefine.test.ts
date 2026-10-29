import { describe, it, expect } from 'vitest'
import { validarReceta } from '../clients/openrefine'

describe('validarReceta', () => {
  it('rejects non-object receta', () => {
    const res = validarReceta(null as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('objeto')
  })

  it('requires datos: "publicos"', () => {
    const res = validarReceta({ operations: [], datos: 'privados' } as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('datos')
  })

  it('fails if >100 ops', () => {
    const ops = new Array(101).fill({ op: 'text-transform', expression: 'grel:1' })
    const res = validarReceta({ operations: ops, datos: 'publicos' } as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('100')
  })

  it('fails if too large', () => {
    const bigString = 'a'.repeat(200 * 1024 + 1)
    const res = validarReceta({ operations: [], datos: 'publicos', extra: bigString } as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('200 KB')
  })

  it('rejects unlisted op', () => {
    const res = validarReceta({ operations: [{ op: 'unknown', expression: 'grel:1' }], datos: 'publicos' } as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Operación fuera de la lista blanca')
  })

  it('rejects prohibited op names', () => {
    const res1 = validarReceta({ operations: ['jython:code'] , datos: 'publicos' } as any)
    expect(res1.ok).toBe(false)
    expect(res1.error).toContain('desconocida')
    const res2 = validarReceta({ operations: ['core/column-addition-by-fetching-urls'], datos: 'publicos' } as any)
    expect(res2.ok).toBe(false)
    expect(res2.error).toContain('desconocida')
  })

  it('rejects non-grel expressions', () => {
    const res = validarReceta({ operations: [{ op: 'text-transform', expression: 'python: 1' }], datos: 'publicos' } as any)
    expect(res.ok).toBe(false)
    expect(res.error).toContain('grel:')
  })

  it('passes a valid recipe', () => {
    const res = validarReceta({ operations: [{ op: 'text-transform', expression: 'grel:a' }], datos: 'publicos' } as any)
    expect(res.ok).toBe(true)
    expect(res.error).toBeUndefined()
  })
})
