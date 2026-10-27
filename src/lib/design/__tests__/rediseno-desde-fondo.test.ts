import { describe, it, expect } from "vitest"
import { ratioContraste, componerAlfa, hslDe, propuestasDesdeFondo, pedidoParaIA } from "../rediseno-desde-fondo"
import type { AdnDiseno, EntradaPedido } from "../rediseno-desde-fondo"
import type { EntradaPaleta } from "../paleta-fondo"
function hslAHex(hsl: string): string {
  const m = /^(\d+) (\d+)% (\d+)%$/.exec(hsl)
  if (!m) throw new Error(`HSL inesperado: ${hsl}`)
  const h = Number(m[1]) / 360, s = Number(m[2]) / 100, l = Number(m[3]) / 100
  const f = (n: number): number => {
    const k = (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}
const PALETA: EntradaPaleta[] = [
  { color: "#f4e6c8", peso: 0.4 }, { color: "#0b1a2a", peso: 0.3 },
  { color: "#c03b2b", peso: 0.2 }, { color: "#2d7dd2", peso: 0.1 },
]
const TEMA = {
  vars: { "background-hsl": "220 30% 20%", "font-body": "Outfit" }, background: "weather-live", fontFamily: "Outfit", motion: 1,
}
const propuestas = (adn?: AdnDiseno, modo: "claro" | "oscuro" = "claro") =>
  propuestasDesdeFondo({ paleta: PALETA, temaActual: TEMA, modo, adn })

function verificarAA(tokens: Record<string, string>): void {
  const alfa = Number(tokens["surface-alpha"])
  const superficie = hslAHex(tokens["card-hsl"])
  const texto = hslAHex(tokens["foreground-hsl"])
  for (const e of PALETA) {
    expect(ratioContraste(texto, componerAlfa(superficie, alfa, e.color))).toBeGreaterThanOrEqual(4.5)
  }
}
describe("rediseno-desde-fondo", () => {
  describe("contraste y color", () => {
    it("mide contraste WCAG y compone alfa", () => {
      expect(ratioContraste("#000000", "#ffffff")).toBeCloseTo(21, 5)
      expect(ratioContraste("#777777", "#777777")).toBeCloseTo(1, 5)
      expect(componerAlfa("#ffffff", 0.5, "#000000")).toBe("#808080")
      expect(componerAlfa("#ff0000", 0, "#00ff00")).toBe("#00ff00")
    })

    it("convierte hex a HSL en el formato de los tokens", () => {
      expect(hslDe("#ff0000")).toEqual([0, 100, 50])
      expect(hslDe("#ffffff")).toEqual([0, 0, 100])
      expect(hslDe("#000000")).toEqual([0, 0, 0])
      expect(hslDe("#00ff00")).toEqual([120, 100, 50])
    })
  })

  describe("propuestasDesdeFondo", () => {
    it("da las tres, en orden, con superficies translúcidas y fondo conservado", () => {
      const lista = propuestas()
      expect(lista.map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"])
      expect(lista.map((p) => p.nombre)).toEqual(["Sobria", "Armónica", "Atrevida"])
      for (const p of lista) {
        expect(p.motivo.length).toBeGreaterThan(20)
        expect(p.tokens).toMatchObject({ background: "weather-live", fontFamily: "Outfit", materialClass: "ss-crystal" })
        const alfa = Number(p.tokens.vars["surface-alpha"])
        expect(alfa).toBeGreaterThan(0)
        expect(alfa).toBeLessThan(1)
        expect(p.alfa).toBe(alfa)
        expect(p.tokens.vars["background-alpha"]).toBe("0")
      }
    })
    it("pasa AA (≥ 4,5:1) en claro y oscuro sobre todas las superficies", () => {
      for (const modo of ["claro", "oscuro"] as const) {
        const lista = propuestas(undefined, modo)
        expect(lista).toHaveLength(3)
        for (const p of lista) {
          expect(p.contraste).toBeGreaterThanOrEqual(4.5)
          verificarAA(p.tokens.vars)
        }
      }
    })
    it("usa acentos de la paleta y la escala φ", () => {
      const paletaHsl = PALETA.map((e) => { const [h, sa, l] = hslDe(e.color); return `${h} ${sa}% ${l}%` })
      for (const p of propuestas()) {
        expect(paletaHsl).toContain(p.tokens.vars["accent-hsl"])
        expect(p.tokens.vars["phi"]).toBe("1.618")
        expect(p.tokens.vars["fs-phi-2"]).toBe("2.618rem")
        expect(p.tokens.vars["radius"]).toMatch(/rem$/)
      }
    })
    it("es determinista, cae en neutro sin paleta y atiende al ADN", () => {
      expect(propuestas()).toEqual(propuestas())
      expect(propuestasDesdeFondo({ paleta: [], temaActual: TEMA, modo: "oscuro" })).toHaveLength(3)
      const conAdn = propuestas({ energia: 10, adjetivos: ["sobrio"], jugadaRara: "una línea cruza" })
      expect(conAdn[0].motivo).toContain("ADN:")
      expect(conAdn[0].tokens.motion).toBeGreaterThan(propuestas({ energia: 0 })[0].tokens.motion as number)
    })
  })
  describe("pedidoParaIA", () => {
    const gustos = [
      { texto: "prefiere vidrio", visibilidad: "publico" as const },
      { texto: "odia el oro", visibilidad: "privado" as const },
    ]
    const entrada: EntradaPedido = {
      propuestas: propuestas(), paleta: PALETA, modo: "claro", memoriaGustos: gustos,
      adn: { firmas: ["titular 6× cuerpo"], prohibiciones: ["nunca centrar"] },
    }
    it("respeta la privacidad: lo privado solo en neurona propia y contexto propio", () => {
      const fuera = pedidoParaIA(entrada)
      expect(fuera.instruccion).toContain("prefiere vidrio")
      expect(fuera.instruccion).not.toContain("odia el oro")
      expect(fuera.incluyePrivado).toBe(false)
      const dentro = pedidoParaIA({ ...entrada, enNeuronaPropia: true })
      expect(dentro.instruccion).toContain("odia el oro")
      expect(dentro.incluyePrivado).toBe(true)
      expect(pedidoParaIA({ ...entrada, enNeuronaPropia: true, contexto: "compartido" }).instruccion).not.toContain("odia el oro")
    })
    it("lleva propuestas, paleta, ADN y guardas", () => {
      const texto = pedidoParaIA(entrada).instruccion
      for (const p of ["Sobria", "Armónica", "Atrevida", "#f4e6c8", "titular 6× cuerpo", "nunca centrar", "44 px"]) {
        expect(texto).toContain(p)
      }
    })
  })
})
