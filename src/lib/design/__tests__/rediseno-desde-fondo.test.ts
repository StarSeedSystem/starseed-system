import { describe, it, expect } from "vitest"
import { propuestasDesdeFondo, pedidoParaIA } from "../rediseno-desde-fondo"
import type { AdnDiseno, EntradaPedido } from "../rediseno-desde-fondo"
import type { ThemeTokens } from "../theme-engine"

const TEMA: ThemeTokens = { vars: { "background-hsl": "260 30% 8%" }, fontFamily: "Fraunces", motion: 1 }
const PALETA = [
  { color: "#0A0E27", peso: 0.5 },
  { color: "#10B981", peso: 0.3 },
  { color: "#FFBF00", peso: 0.2 },
]
const ADN: AdnDiseno = {
  nombre: "Aurora",
  alma: { una_linea: "Cálida y precisa", adjetivos: ["cálida"] },
  firmas: [{ jugada: "cristal", como: "bordes suaves" }],
  prohibiciones: ["neón chillón"],
}
const BASE = { paleta: PALETA, temaActual: TEMA, adn: ADN }
const numero = (valor: string): number => parseFloat(valor)

describe("propuestasDesdeFondo", () => {
  it("devuelve sobria, armónica y atrevida, cada una con su motivo", () => {
    const propuestas = propuestasDesdeFondo({ ...BASE, modo: "oscuro" })
    expect(propuestas.map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"])
    for (const p of propuestas) {
      expect(p.nombre.length).toBeGreaterThan(0)
      expect(p.motivo).toContain("φ")
      expect(p.motivo).toContain("cálida")
      expect(p.tokens.vars["background-hsl"]).toMatch(/^\d+ \d+% \d+%$/)
    }
  })
  it("usa superficies translúcidas y la escala φ de armonia", () => {
    const [sobria, armonica, atrevida] = propuestasDesdeFondo({ ...BASE, modo: "oscuro" })
    const opacidad = (p: typeof sobria): number => Number(p.tokens.vars["glass-opacity"])
    expect(opacidad(sobria)).toBeGreaterThan(opacidad(armonica))
    expect(opacidad(armonica)).toBeGreaterThan(opacidad(atrevida))
    for (const p of [sobria, armonica, atrevida]) {
      expect(opacidad(p)).toBeGreaterThan(0)
      expect(opacidad(p)).toBeLessThan(1)
      expect(p.tokens.vars["background-hsl"]).not.toContain("/")
      expect(p.tokens.vars["card-hsl"]).toContain("/")
      expect(p.tokens.vars["popover-hsl"]).toContain("/")
      expect(p.tokens.vars.phi).toBe("1.6180339887")
      expect(numero(p.tokens.vars["fs-phi-1"]) / numero(p.tokens.vars["fs-phi-0"])).toBeCloseTo(1.618, 3)
      expect(numero(p.tokens.vars["fs-phi-2"]) / numero(p.tokens.vars["fs-phi-1"])).toBeCloseTo(1.618, 3)
    }
  })
  it("toma los acentos de la paleta", () => {
    const [sobria] = propuestasDesdeFondo({ ...BASE, modo: "oscuro" })
    expect(sobria.tokens.vars["primary-hsl"]).toContain("160")
    expect(sobria.tokens.vars["primary-hsl"]).not.toBe(sobria.tokens.vars["background-hsl"])
  })
  it("verifica contraste AA: ninguna propuesta válida queda por debajo de 4,5 ni se descarta", () => {
    for (const modo of ["claro", "oscuro"] as const) {
      for (const p of propuestasDesdeFondo({ ...BASE, modo })) {
        expect(p.contraste).toBeGreaterThanOrEqual(4.5)
        expect(p.descartada).toBe(false)
        expect(p.ajustada).toBeTypeOf("boolean")
      }
    }
  })
  it("es determinista y sigue funcionando sin paleta ni ADN", () => {
    const entrada = { paleta: [], temaActual: TEMA, modo: "claro" as const, adn: null }
    expect(propuestasDesdeFondo(entrada)).toEqual(propuestasDesdeFondo(entrada))
    const propuestas = propuestasDesdeFondo(entrada)
    expect(propuestas).toHaveLength(3)
    for (const p of propuestas) {
      expect(p.motivo).not.toContain("ADN")
      expect(p.tokens.vars["background-hsl"]).toMatch(/^\d+ \d+% \d+%$/)
      expect(p.contraste).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe("pedidoParaIA", () => {
  const propuestas = propuestasDesdeFondo({ ...BASE, modo: "oscuro" })
  const comun: EntradaPedido = {
    ...BASE, modo: "oscuro", ambito: "compartido",
    gustosPrivados: ["prefiere sombras suaves", ""],
    gustosCompartidos: ["le gusta el vidrio", "le gusta el vidrio"],
    propuestas,
  }
  it("arma el pedido al Director de diseño con propuestas, ADN y guardas", () => {
    const pedido = pedidoParaIA(comun)
    expect(pedido.rol).toBe("director-diseno")
    expect(pedido.intencion).toContain("oscuro")
    expect(pedido.contexto.colores).toEqual(["#0a0e27", "#10b981", "#ffbf00"])
    expect(pedido.contexto.adn).toContain("Aurora")
    expect(pedido.contexto.adn).toContain("cristal")
    expect(pedido.propuestas).toHaveLength(3)
    expect(pedido.propuestas[0]).toEqual({
      id: propuestas[0].id, nombre: propuestas[0].nombre, motivo: propuestas[0].motivo,
      contraste: propuestas[0].contraste, descartada: propuestas[0].descartada,
    })
    expect(pedido.guardas.join(" ")).toContain("4.5")
    expect(pedido.guardas.join(" ")).toContain("44 px")
    expect(pedido.formatoSalida).toContain("ThemeTokens")
  })
  it("en contexto compartido no envía la memoria privada", () => {
    const pedido = pedidoParaIA(comun)
    expect(pedido.memoriaGustos.privacidad).toBe("solo-compartido")
    expect(pedido.memoriaGustos.gustos).toEqual(["le gusta el vidrio"])
    expect(pedido.memoriaGustos.gustos).not.toContain("prefiere sombras suaves")
    expect(pedido.memoriaGustos.nota).toContain("compartido")
  })
  it("en una neurona privada sí usa la memoria de gustos de la persona", () => {
    const pedido = pedidoParaIA({ ...comun, ambito: "neurona-privada" })
    expect(pedido.memoriaGustos.privacidad).toBe("neurona-propia")
    expect(pedido.memoriaGustos.gustos).toEqual(["le gusta el vidrio", "prefiere sombras suaves"])
    expect(pedido.memoriaGustos.nota).toContain("neurona")
  })
  it("genera las propuestas si no se las pasan", () => {
    const pedido = pedidoParaIA({ ...comun, propuestas: undefined })
    expect(pedido.propuestas.map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"])
  })
})
