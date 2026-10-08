import { describe, it, expect } from "vitest"
import { findOption, getByCategory, OSS_LIBRARY } from "../oss-library"

describe("OSS Library - Red Mesh y Señales", () => {
  it("red-mesh app exists with valid browser url", () => {
    const app = findOption("red-mesh")
    expect(app).toBeDefined()
    expect(app?.name).toBe("Red Mesh")
    expect(app?.category).toBe("app-platform")
    expect(app?.url).toBe("/red-mesh")
    expect(app?.url.startsWith("http") || app?.url.startsWith("/")).toBe(true)
    expect(app?.url.startsWith("internal://")).toBe(false)
  })

  it("senales app exists with valid browser url", () => {
    const app = findOption("senales")
    expect(app).toBeDefined()
    expect(app?.name).toBe("Señales")
    expect(app?.category).toBe("app-platform")
    expect(app?.url).toBe("/senales")
    expect(app?.url.startsWith("http") || app?.url.startsWith("/")).toBe(true)
    expect(app?.url.startsWith("internal://")).toBe(false)
  })

  it("inferencia-distribuida-local capacity exists with valid browser url", () => {
    const cap = findOption("inferencia-distribuida-local")
    expect(cap).toBeDefined()
    expect(cap?.name).toBe("Inferencia distribuida local")
    expect(cap?.tags).toContain("capacidad")
    expect(cap?.tags).toContain("inferencia-local")
    expect(cap?.description).toContain("PAIR")
    expect(cap?.description).toContain("Supertonic 1.58")
    expect(cap?.description).toContain("sin GPU")
    expect(cap?.description).toContain("sin pago por demanda")
    expect(cap?.url).toBe("/senales")
    expect(cap?.url.startsWith("http") || cap?.url.startsWith("/")).toBe(true)
    expect(cap?.url.startsWith("internal://")).toBe(false)
  })
})

describe("OSS Library - URLs válidas", () => {
  it("todas las opciones tienen urls de navegador válidas", () => {
    const invalid = OSS_LIBRARY.filter((o) => 
      o.url.startsWith("internal://") || 
      (!o.url.startsWith("http") && !o.url.startsWith("/"))
    )
    expect(invalid).toHaveLength(0)
  })

  it("findOption devuelve opción correcta por id", () => {
    const redMesh = findOption("red-mesh")
    expect(redMesh?.id).toBe("red-mesh")
    
    const senales = findOption("senales")
    expect(senales?.id).toBe("senales")
    
    const inferencia = findOption("inferencia-distribuida-local")
    expect(inferencia?.id).toBe("inferencia-distribuida-local")
  })

  it("getByCategory filtra correctamente apps de app-platform", () => {
    const apps = getByCategory("app-platform")
    const ids = apps.map((a) => a.id)
    expect(ids).toContain("red-mesh")
    expect(ids).toContain("senales")
  })
})
