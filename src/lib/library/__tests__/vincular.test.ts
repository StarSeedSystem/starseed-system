// src/lib/library/__tests__/vincular.test.ts
import { describe, it, expect } from 'vitest'
import { vinculoDe, VinculoPaquete, instalableEnAmbito } from '../vincular'
import type { LibraryPackage } from '../packages'

const mockCatalog: { id: string; requiereClave: boolean; enlaceAlta: string | null; enlaceClave: string | null; gratis: boolean; variables: string[] }[] = [
  { id: 'p1', requiereClave: true, enlaceAlta: 'a', enlaceClave: 'b', gratis: false, variables: ['X'] },
  { id: 'p2', requiereClave: false, enlaceAlta: null, enlaceClave: null, gratis: true, variables: [] }
]

describe('vinculoDe', () => {
  it('devuelve vinculo del catálogo cuando el catalogSourceId coincide', () => {
    const pkg: LibraryPackage = { id: '1', kind: 'ai-source', name: '', description: '', icon: '', tags: [], version: '', author: '', sourceRepoId: '', free: true, payload: { catalogSourceId: 'p1' } }
    expect(vinculoDe(pkg, mockCatalog)).toEqual({ requiereClave: true, enlaceAlta: 'a', enlaceClave: 'b', gratis: false, variables: ['X'], opcionId: 'p1' })
  })

  it('devuelve vinculo predeterminado cuando el catalogSourceId no se encuentra', () => {
    const pkg: LibraryPackage = { id: '1', kind: 'ai-source', name: '', description: '', icon: '', tags: [], version: '', author: '', sourceRepoId: '', free: false, payload: { catalogSourceId: 'x' } }
    expect(vinculoDe(pkg, mockCatalog)).toEqual({ requiereClave: false, enlaceAlta: null, enlaceClave: null, gratis: false, variables: [], opcionId: null })
  })

  it('devuelve vinculo predeterminado cuando no hay catalogSourceId', () => {
    const pkg: LibraryPackage = { id: '1', kind: 'ai-source', name: '', description: '', icon: '', tags: [], version: '', author: '', sourceRepoId: '', free: true, payload: {} }
    expect(vinculoDe(pkg, mockCatalog)).toEqual({ requiereClave: false, enlaceAlta: null, enlaceClave: null, gratis: true, variables: [], opcionId: null })
  })
})

describe('instalableEnAmbito', () => {
  const pkg: LibraryPackage = { id: 'pkg', kind: 'ai-source', name: '', description: '', icon: '', tags: [], version: '', author: '', sourceRepoId: '', free: true, payload: {} }

  it('devuelve false si el paquete ya está vinculado', () => {
    expect(instalableEnAmbito(pkg, { maxVincolados: null, limiteAlcanzado: false, permiteClaves: true }, new Set(['pkg']))).toBe(false)
  })

  it('devuelve false si se ha alcanzado el límite', () => {
    expect(instalableEnAmbito(pkg, { maxVinculados: 5, limiteAlcanzado: true, permiteClaves: true }, new Set())).toBe(false)
  })

  it('devuelve false si requiere clave y el ámbito no permite claves', () => {
    const pkgWithKey: LibraryPackage = { ...pkg, payload: { requiresKey: true } }
    expect(instalableEnAmbito(pkgWithKey, { maxVinculados: null, limiteAlcanzado: false, permiteClaves: false }, new Set())).toBe(false)
  })

  it('devuelve true en otros casos', () => {
    expect(instalableEnAmbito(pkg, { maxVinculados: 10, limiteAlcanzado: false, permiteClaves: true }, new Set())).toBe(true)
  })
})