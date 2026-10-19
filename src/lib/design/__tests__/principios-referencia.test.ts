import { describe, it, expect } from "vitest"
import {
  PRINCIPIOS_USABILIDAD,
  REGLAS_REDACCION,
  revisarTexto
} from "../principios-referencia"

/* RFI1018C — principios de usabilidad y redacción clara */

describe("principios de usabilidad", () => {
  it("debe tener exactamente 8 principios", () => {
    expect(PRINCIPIOS_USABILIDAD).toHaveLength(8)
  })

  it("cada principio debe tener id, titulo y descripcion", () => {
    for (const principio of PRINCIPIOS_USABILIDAD) {
      expect(principio).toHaveProperty("id")
      expect(principio).toHaveProperty("titulo")
      expect(principio).toHaveProperty("descripcion")
    }
  })
})

describe("reglas de redacción", () => {
  it("debe tener exactamente 8 reglas", () => {
    expect(REGLAS_REDACCION).toHaveLength(8)
  })

  it("cada regla debe tener id, titulo y descripcion", () => {
    for (const regla of REGLAS_REDACCION) {
      expect(regla).toHaveProperty("id")
      expect(regla).toHaveProperty("titulo")
      expect(regla).toHaveProperty("descripcion")
    }
  })
})

describe("revisarTexto", () => {
  it("debe retornar objeto con las propiedades esperadas", () => {
    const resultado = revisarTexto("Texto de prueba. Otra frase aquí.")
    expect(resultado).toHaveProperty("largoPromedioPalabras")
    expect(resultado).toHaveProperty("posiblesPasivas")
    expect(resultado).toHaveProperty("usoJerga")
    expect(typeof resultado.largoPromedioPalabras).toBe("number")
    expect(typeof resultado.posiblesPasivas).toBe("number")
    expect(Array.isArray(resultado.usoJerga)).toBe(true)
  })

  it("cuenta correctamente palabras por frase en texto corto", () => {
    const resultado = revisarTexto("Hola mundo. Esto es una prueba.")
    expect(resultado.largoPromedioPalabras).toBeGreaterThan(0)
  })

  it("detecta indicadores de voz pasiva", () => {
    const resultado = revisarTexto("El documento fue revisado ayer.")
    expect(resultado.posiblesPasivas).toBeGreaterThan(0)
  })

  it("no detecta pasivas en texto activo", () => {
    const resultado = revisarTexto("Revisamos el documento ayer.")
    expect(resultado.posiblesPasivas).toBe(0)
  })

  it("identifica posibles palabras de jerga", () => {
    const resultado = revisarTexto("Por favor considere esta opción. Queremos proceder.")
    expect(resultado.usoJerga).toContain("por favor")
    expect(resultado.usoJerga).toContain("proceder")
  })

  it("devuelve array vacío de jerga cuando no hay coincidencias", () => {
    const resultado = revisarTexto("Texto sin palabras especiales.")
    expect(resultado.usoJerga).toHaveLength(0)
  })
})