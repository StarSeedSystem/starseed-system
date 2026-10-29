import { describe, it, expect } from "vitest"
import { contextoDisenoIA } from "../principios-referencia"

const ENTIDAD = { tipo: "grupo", nombre: "Semilla", registro: "expresivo", seccion: "astraura" }

describe("contextoDisenoIA · el diseño que recibe la creación con IA", () => {
  it("devuelve un texto breve, determinista y con los tres bloques", () => {
    const texto = contextoDisenoIA(ENTIDAD)
    expect(texto.length).toBeGreaterThan(100)
    expect(texto.length).toBeLessThanOrEqual(900)
    expect(contextoDisenoIA(ENTIDAD)).toBe(texto)
    expect(texto).toContain("ADN")
    expect(texto).toContain("Movimiento")
    expect(texto).toContain("Símbolo")
  })

  it("cita el ADN: composición centrada, Trinity un color por papel, brillo multicapa y solo transform/opacity", () => {
    const texto = contextoDisenoIA(ENTIDAD)
    expect(texto).toContain("composición centrada")
    expect(texto).toContain("Trinity, un color por papel")
    expect(texto).toContain("brillo multicapa")
    expect(texto).toContain("transform y opacity")
  })

  it("cita el registro de movimiento de DAN1024G con los tiempos del OS", () => {
    const texto = contextoDisenoIA(ENTIDAD)
    expect(texto).toContain("DAN1024G")
    expect(texto).toContain("registro de la entidad")
    expect(texto).toContain("«expresivo»")
    expect(texto).toContain("entrada 300 ms")
    expect(texto).toContain("salida 220 ms")
    expect(texto).toContain("prefers-reduced-motion")
  })

  it("acepta los tres registros y cae a sobrio ante uno desconocido", () => {
    for (const registro of ["sobrio", "expresivo", "experimental"] as const) {
      expect(contextoDisenoIA({ registro })).toContain(`«${registro}»`)
    }
    expect(contextoDisenoIA({ registro: "inventado" })).toContain("«sobrio»")
    expect(contextoDisenoIA({ movimiento: "experimental" })).toContain("«experimental»")
    expect(contextoDisenoIA({ registroMovimiento: "fluido" })).toContain("«sobrio»")
  })

  it("no lleva claves ni rutas aunque la entidad las traiga", () => {
    const texto = contextoDisenoIA({
      tipo: "grupo",
      id: "sk-live-123",
      nombre: "src/lib/secreto.ts",
      registro: "expresivo",
    })
    expect(texto).not.toMatch(/\//)
    expect(texto).not.toMatch(/sk-live|secreto\.ts|https?:|process\.env|api[_-]?key/i)
    expect(texto).toContain("grupo")
  })

  it("sin entidad sigue siendo útil y nunca lanza", () => {
    expect(() => contextoDisenoIA()).not.toThrow()
    expect(contextoDisenoIA(null).length).toBeLessThanOrEqual(900)
    expect(contextoDisenoIA({}).length).toBeGreaterThan(100)
  })
})

describe("acción video.componer · el contexto de diseño viaja a la creación", () => {
  it("lo incluye en el mensaje y en los datos sin cambiar el contrato de salida", async () => {
    const { manejarAccionProtomolecula } = await import("@/lib/protomolecula/accion-agente")
    const r = manejarAccionProtomolecula({
      accion: "video.componer",
      pedido: "Bienvenida",
      duracion: 3,
      formato: "mp4",
      entidad: { tipo: "grupo", registro: "expresivo", seccion: "astraura" },
    })
    expect(r.ok).toBe(true)
    expect(r.message).toContain("Contexto de diseño para la creación")
    expect(r.message).toContain("DAN1024G")
    const datos = r.datos as { html: string; contextoDiseno: string }
    expect(datos.html).toContain("Bienvenida")
    expect(datos.contextoDiseno).toContain("«expresivo»")
  })
})
