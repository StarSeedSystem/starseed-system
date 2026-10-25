import { describe, it, expect } from "vitest"
import { propuestasDesdeFondo, pedidoParaIA, type EntradaRediseno } from "../rediseno-desde-fondo"
import type { ThemeTokens } from "../theme-engine"
import type { EntradaPaleta } from "../paleta-fondo"

const PALETA: EntradaPaleta[] = [
  { color: "#ff0000", peso: 0.5 }, { color: "#00ff00", peso: 0.3 }, { color: "#0000ff", peso: 0.2 },
]
const TEMA: ThemeTokens = {
  vars: { "primary-hsl": "190 100% 50%", "accent-hsl": "42 90% 55%", "secondary-hsl": "280 60% 60%" },
}
const ENTRADA: EntradaRediseno = {
  paleta: PALETA, temaActual: TEMA, modo: "oscuro", adn: { identidad: "Genesis", motivos: ["vesica piscis"], radio: 1.25 },
}

type Triple = [number, number, number]
const hslDe = (v: string): Triple => v.split(/\s+/).map((x) => parseFloat(x)) as Triple
function luminancia([h, s, l]: Triple): number {
  const sn = s / 100, ln = l / 100, a = sn * Math.min(ln, 1 - ln)
  const canal = (n: number): number => {
    const k = (n + h / 30) % 12, v = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(8) + 0.0722 * canal(4)
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(hslDe(a)), luminancia(hslDe(b))].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

describe("rediseno-desde-fondo", () => {
  it("devuelve tres propuestas con nombre y motivo del ADN", () => {
    const propuestas = propuestasDesdeFondo(ENTRADA)
    expect(propuestas.map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"])
    expect(propuestas.map((p) => p.nombre)).toEqual(["Sobria", "Armónica", "Atrevida"])
    for (const p of propuestas) {
      expect(p.motivo.length).toBeGreaterThan(0)
      expect(p.motivo).toContain("vesica piscis")
    }
  })

  it("usa superficies translúcidas, deja el fondo intacto y añade la escala φ", () => {
    for (const p of propuestasDesdeFondo(ENTRADA)) {
      expect(Number(p.tokens.vars["glass-opacity"])).toBeLessThan(1)
      expect(Number(p.tokens.vars["glass-opacity"])).toBeGreaterThan(0)
      expect(p.tokens.vars["card-hsl"]).toBeTruthy()
      expect(p.tokens.background).toBeUndefined()
      expect(p.tokens.vars["fs-phi--2"]).toBe("0.382rem")
      expect(p.tokens.vars["fs-phi--1"]).toBe("0.618rem")
      expect(p.tokens.vars["fs-phi-1"]).toBe("1.618rem")
      expect(p.tokens.vars["fs-phi-4"]).toBe("6.854rem")
    }
  })

  it("verifica AA en claro y oscuro y ajusta en lugar de descartar", () => {
    for (const modo of ["claro", "oscuro"] as const) {
      for (const p of propuestasDesdeFondo({ ...ENTRADA, modo })) {
        expect(p.descartada, `${modo}:${p.id}`).toBe(false)
        expect(contraste(p.tokens.vars["foreground-hsl"], p.tokens.vars["card-hsl"])).toBeGreaterThanOrEqual(4.5)
        expect(p.contraste).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it("toma los acentos de la paleta conservando su matiz", () => {
    for (const p of propuestasDesdeFondo(ENTRADA)) {
      expect(Number(p.tokens.vars["primary-hsl"].split(" ")[0])).toBeCloseTo(0, 0)
      expect(p.tokens.vars["primary-rgb"]).toMatch(/^\d+, \d+, \d+$/)
    }
  })

  it("es determinista y gradúa opacidad y movimiento", () => {
    const a = propuestasDesdeFondo(ENTRADA), b = propuestasDesdeFondo(ENTRADA)
    expect(a).toEqual(b)
    expect(Number(a[2].tokens.vars["glass-opacity"])).toBeLessThan(Number(a[0].tokens.vars["glass-opacity"]))
    expect(a[2].tokens.motion).toBeGreaterThan(a[0].tokens.motion ?? 0)
  })

  it("sin paleta recurre al tema actual y no rompe con pesos nulos", () => {
    const propuestas = propuestasDesdeFondo({ ...ENTRADA, paleta: [] })
    expect(propuestas).toHaveLength(3)
    expect(propuestas[0].tokens.vars["primary-hsl"]).toBeTruthy()
    expect(propuestasDesdeFondo({ ...ENTRADA, paleta: [{ color: "#777777", peso: 0 }] })).toHaveLength(3)
  })
})

describe("pedidoParaIA", () => {
  const base = {
    propuesta: "armonica" as const, paleta: PALETA, modo: "oscuro" as const,
    adn: { identidad: "Genesis", motivos: ["espiral áurea"] },
    gustos: { publicos: ["cristal sereno"], privados: ["mi diario secreto"] },
  }

  it("incluye gustos públicos y la paleta; lo privado solo en una neurona propia", () => {
    const fuera = pedidoParaIA({ ...base, correEnNeuronaPropia: false })
    expect(fuera.instruccion).toContain("cristal sereno")
    expect(fuera.instruccion).toContain("#ff0000")
    expect(fuera.instruccion).toContain("Genesis")
    expect(fuera.incluyePrivado).toBe(false)
    expect(fuera.instruccion).not.toContain("mi diario secreto")
    expect(fuera.aviso).toContain("no sale")

    const dentro = pedidoParaIA({ ...base, correEnNeuronaPropia: true })
    expect(dentro.incluyePrivado).toBe(true)
    expect(dentro.instruccion).toContain("mi diario secreto")
    expect(dentro.aviso).toContain("neuronas de la persona")
  })
})
