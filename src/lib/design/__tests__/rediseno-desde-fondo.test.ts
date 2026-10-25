import { describe, it, expect } from "vitest"
import { propuestasDesdeFondo, pedidoParaIA } from "../rediseno-desde-fondo"
import { contraste, mezclar } from "../../xr/tokens-3d"
import type { ThemeTokens } from "../theme-engine"

const PALETA = [
  { color: "#0A0F1D", peso: 0.4 },
  { color: "#10B981", peso: 0.3 },
  { color: "#FFBF00", peso: 0.2 },
  { color: "#00F0FF", peso: 0.1 },
]
const TEMA: ThemeTokens = { vars: { "font-body": "Inter" }, fontFamily: "Inter", motion: 0.8 }
const ENTRADA = { paleta: PALETA, temaActual: TEMA, modo: "oscuro" as const }

const hslARgb = (hsl: string): string => {
  const [h, s, l] = hsl.match(/[\d.]+/g)!.map(Number)
  const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100), x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l / 100 - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("")}`
}

const RESULTADO = propuestasDesdeFondo(ENTRADA)

describe("propuestasDesdeFondo", () => {
  it("devuelve sobria, armónica y atrevida, cada una con su motivo y geometría", () => {
    expect(RESULTADO.propuestas.map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"])
    expect(RESULTADO.descartadas).toEqual([])
    for (const p of RESULTADO.propuestas) {
      expect(p.motivo.length).toBeGreaterThan(10)
      expect(p.geometria.length).toBeGreaterThan(3)
    }
  })

  it("deja ver el fondo con superficies translúcidas y α decreciente", () => {
    const alfas = RESULTADO.propuestas.map((p) => Number(p.tokens.vars["glass-opacity"]))
    expect(alfas.every((a) => a > 0.4 && a < 1)).toBe(true)
    expect(alfas[0]).toBeGreaterThan(alfas[1])
    expect(alfas[1]).toBeGreaterThan(alfas[2])
    for (const p of RESULTADO.propuestas) expect(p.tokens.materialClass).toBe("ss-crystal")
  })

  it("incluye la escala φ y el radio armónico", () => {
    const vars = RESULTADO.propuestas[1].tokens.vars
    expect(vars["fs-phi-1"]).toBe("1.618rem")
    expect(vars["fs-phi-2"]).toBe("2.618rem")
    expect(vars["radius"]).toBe("1.625rem")
  })

  it("verifica AA 4,5:1 sobre la superficie compuesta", () => {
    for (const p of RESULTADO.propuestas) {
      const v = p.tokens.vars, fondo = hslARgb(v["background-hsl"])
      const card = mezclar(hslARgb(v["card-hsl"]), Number(v["glass-opacity"]), fondo)
      expect(contraste(hslARgb(v["foreground-hsl"]), card)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(hslARgb(v["muted-foreground-hsl"]), card)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(hslARgb(v["primary-hsl"]), card)).toBeGreaterThanOrEqual(4.5)
      expect(contraste(hslARgb(v["primary-foreground-hsl"]), hslARgb(v["primary-hsl"]))).toBeGreaterThanOrEqual(4.5)
      expect(p.contraste.textoSuperficie).toBeGreaterThanOrEqual(4.5)
    }
  })

  it("es determinista y funciona sin paleta y en claro", () => {
    expect(propuestasDesdeFondo(ENTRADA)).toEqual(RESULTADO)
    const claro = propuestasDesdeFondo({ paleta: [], temaActual: {}, modo: "claro" })
    expect(claro.propuestas).toHaveLength(3)
    expect(claro.propuestas[0].tokens.vars["background-hsl"]).toBeTruthy()
    expect(claro.propuestas[0].tokens.vars["foreground-hsl"]).toBeTruthy()
  })

  it("respeta el ADN: tipografía, radio, movimiento y motivo", () => {
    const r = propuestasDesdeFondo({ ...ENTRADA, adn: { tipografia: "'Satoshi', sans-serif", radio: 1.25, movimiento: 1.2, motivos: ["metatrón"] } })
    expect(r.propuestas[0].tokens.fontFamily).toBe("'Satoshi', sans-serif")
    expect(r.propuestas[0].tokens.vars["radius"]).toBe("1.25rem")
    expect(r.propuestas[0].tokens.motion).toBe(1.2)
    expect(r.propuestas[0].geometria).toBe("metatrón")
    expect(r.propuestas[1].geometria).toBe("vesica piscis")
  })
})

describe("pedidoParaIA", () => {
  const base = { paleta: ["#10B981", "#FFBF00"], modo: "oscuro" as const, gustos: { publicos: ["minimalista", "cristal"], privados: ["prefiere el rojo"] } }

  it("usa lo privado solo en una neurona propia y no compartida", () => {
    const propio = pedidoParaIA({ ...base, enNeuronaPropia: true })
    expect(propio.privacidad.incluyePrivado).toBe(true)
    expect(propio.memoria).toEqual(["minimalista", "cristal", "prefiere el rojo"])
    const compartido = pedidoParaIA({ ...base, enNeuronaPropia: true, contextoCompartido: true })
    expect(compartido.privacidad.incluyePrivado).toBe(false)
    expect(compartido.memoria).toEqual(["minimalista", "cristal"])
    expect(compartido.privacidad.motivo).toContain("compartido")
    const fuera = pedidoParaIA(base)
    expect(fuera.privacidad.incluyePrivado).toBe(false)
    expect(fuera.privacidad.motivo).toContain("neurona propia")
  })

  it("arma el encargo con fondo, escala φ, guardas y política gratis-primero", () => {
    const pedido = pedidoParaIA({ ...base, propuestas: RESULTADO.propuestas, adn: { nombre: "Astraura" } })
    expect(pedido.fondo.colores).toEqual(["#10b981", "#ffbf00"])
    expect(pedido.politica).toEqual({ gratisPrimero: true, relevoEn: [429, 402] })
    const texto = [pedido.encargo, ...pedido.instrucciones].join(" ")
    expect(texto).toContain("escala φ")
    expect(texto).toContain("control esencial")
    expect(texto).toContain("AA ≥ 4,5")
    expect(texto).toContain("3840 px")
    expect(texto).toContain("Astraura")
    expect(texto).toContain("Sobria")
  })
})
