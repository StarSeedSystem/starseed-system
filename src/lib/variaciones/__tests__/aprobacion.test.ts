// src/lib/variaciones/__tests__/aprobacion.test.ts
import { describe, it, expect } from "vitest"
import { crearVariacion, seguirVariacion, EstadoVariacion, MetaVariacion } from "../aprobacion"

describe("Variación aprobación", () => {
  it("debe iniciar en borrador y permitir proponer", () => {
    const v = crearVariacion()
    expect(v.estado).toBe(EstadoVariacion.BORRADOR)
    const v2 = seguirVariacion(v, "proponer")
    expect(v2.estado).toBe(EstadoVariacion.PROPUESTA)
  })

  it("solo se puede aprobar desde propuesta", () => {
    const v = crearVariacion()
    const vp = seguirVariacion(v, "proponer")
    const vA = seguirVariacion(vp, "aprobar", "Alex")
    expect(vA.estado).toBe(EstadoVariacion.APROBADA)
    expect(vA.meta?.aprobador).toBe("Alex")
  })

  it("desde aprobada se puede cambiar, descartar o publicar", () => {
    const v = crearVariacion()
    const vp = seguirVariacion(v, "proponer")
    const vA = seguirVariacion(vp, "aprobar", "Ana")
    const vC = seguirVariacion(vA, "cambiar")
    expect(vC.estado).toBe(EstadoVariacion.CAMBIOS)
    const vA2 = seguirVariacion(vC, "aprobar", "María")
    expect(vA2.estado).toBe(EstadoVariacion.APROBADA)
    const vP = seguirVariacion(vA2, "publicar", "Luis")
    expect(vP.estado).toBe(EstadoVariacion.PUBLICADA)
  })

  it("desde descartada solo publicar", () => {
    const v = crearVariacion()
    const vp = seguirVariacion(v, "proponer")
    const vA = seguirVariacion(vp, "aprobar", "Eva")
    const vD = seguirVariacion(vA, "descartar")
    expect(vD.estado).toBe(EstadoVariacion.DESCARTADA)
    const vP = seguirVariacion(vD, "publicar", "Pedro")
    expect(vP.estado).toBe(EstadoVariacion.PUBLICADA)
  })

  it("no permite transiciones inválidas", () => {
    const v = crearVariacion()
    expect(() => seguirVariacion(v, "aprobar")).toThrow()
    const vp = seguirVariacion(v, "proponer")
    expect(() => seguirVariacion(vp, "cambiar")).toThrow()
  })
})
