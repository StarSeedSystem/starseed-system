import { describe, it, expect } from "vitest"
import type { EntradaPaleta } from "../paleta-fondo"
import { luminanciaDe } from "../paleta-fondo"
import type { ThemeTokens } from "../theme-engine"
import {
  PHI,
  contrasteHex,
  escalaPhi,
  hexAHsl,
  hslAHex,
  pedidoParaIA,
  propuestasDesdeFondo,
} from "../rediseno-desde-fondo"
import type { EntradaPropuestas, PropuestaRediseno } from "../rediseno-desde-fondo"

const PALETA: EntradaPaleta[] = [
  { color: "#0a0f1d", peso: 0.5 },
  { color: "#00f0ff", peso: 0.3 },
  { color: "#d4af37", peso: 0.2 },
]
const TEMA: ThemeTokens = {
  vars: { "primary-hsl": "270 80% 60%", "background-hsl": "240 20% 10%" },
  background: "aurora",
  fontFamily: "Inter",
  motion: 0.8,
}
const BASE: EntradaPropuestas = {
  paleta: PALETA,
  temaActual: TEMA,
  modo: "oscuro",
  adn: { identidad: "Astraura", motivos: ["flor de la vida"], tipografia: "Rajdhani", radioBase: 1 },
}

const props = (extra: Partial<EntradaPropuestas> = {}): PropuestaRediseno[] =>
  propuestasDesdeFondo({ ...BASE, ...extra })

describe("rediseno-desde-fondo", () => {
  describe("conversión y contraste", () => {
    it("hexAHsl y hslAHex conservan colores primarios", () => {
      expect(hslAHex(hexAHsl("#ff0000"))).toBe("#ff0000")
      expect(hslAHex(hexAHsl("#00ff00"))).toBe("#00ff00")
      expect(hslAHex(hexAHsl("#0000ff"))).toBe("#0000ff")
    })

    it("contrasteHex mide 21:1 entre blanco y negro y 1:1 entre iguales", () => {
      expect(contrasteHex("#ffffff", "#000000")).toBe(21)
      expect(contrasteHex("#10b981", "#10b981")).toBe(1)
    })

    it("escalaPhi da siete pasos con máximos a razón φ", () => {
      const pasos = escalaPhi()
      expect(Object.keys(pasos)).toHaveLength(7)
      const maximos = Object.keys(pasos)
        .sort((a, b) => Number(/fs-phi-(-?\d+)/.exec(a)?.[1]) - Number(/fs-phi-(-?\d+)/.exec(b)?.[1]))
        .map((k) => Number(/,\s*([\d.]+)rem\)$/.exec(pasos[k])?.[1]))
      for (let i = 1; i < maximos.length; i++) expect(maximos[i] / maximos[i - 1]).toBeCloseTo(PHI, 2)
    })
  })

  describe("propuestasDesdeFondo", () => {
    it("devuelve siempre sobria, armónica y atrevida en orden", () => {
      expect(props().map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"])
    })

    it("cada propuesta trae superficies translúcidas, motivo y movimiento propio", () => {
      const lista = props()
      expect(lista[0].motivo).toBe("flor de la vida")
      for (const p of lista) {
        expect(p.motivo.length).toBeGreaterThan(0)
        expect(String(p.tokens.vars["card-hsl"])).toContain("/")
        expect(String(p.tokens.vars["popover-hsl"])).toContain("/")
        expect(p.tokens.fontFamily).toBe("Rajdhani")
        expect(p.tokens.vars.phi).toBe(String(PHI))
        for (let exp = -2; exp <= 4; exp++) expect(p.tokens.vars[`fs-phi-${exp}`]).toBeDefined()
      }
      expect(lista[0].tokens.motion ?? 0).toBeLessThan(lista[2].tokens.motion ?? 0)
    })

    it("usa los acentos de la paleta como primario", () => {
      const esperado = hexAHsl(PALETA[1].color)[0]
      const hPrim = Number(String(props()[0].tokens.vars["primary-hsl"]).split(" ")[0])
      expect(Math.abs(hPrim - esperado)).toBeLessThanOrEqual(2)
      expect(props()[2].tokens.vars["primary-rgb"]).toMatch(/^\d+, \d+, \d+$/)
    })

    it("verifica AA 4,5:1 en texto sobre la superficie compuesta", () => {
      for (const p of props()) {
        expect(p.contraste.ratio).toBeGreaterThanOrEqual(4.5)
        expect(p.contraste.aa).toBe(true)
        expect(contrasteHex(p.contraste.texto, p.contraste.superficie)).toBeGreaterThanOrEqual(4.5)
      }
    })

    it("modo claro aclara la superficie y modo oscuro la oscurece", () => {
      const oscuro = props()[0].contraste.superficie
      const claro = props({ modo: "claro" })[0].contraste.superficie
      expect(luminanciaDe(claro)).toBeGreaterThan(luminanciaDe(oscuro))
    })

    it("sin paleta ni tema usa valores por defecto y lo anota", () => {
      const lista = props({ paleta: [], temaActual: { vars: {} } })
      expect(lista).toHaveLength(3)
      expect(lista[0].ajustes.join(" ")).toContain("sin paleta")
      expect(lista[0].contraste.aa).toBe(true)
    })

    it("no muta el tema actual del usuario", () => {
      props()
      expect(TEMA.vars["card-hsl"]).toBeUndefined()
      expect(TEMA.motion).toBe(0.8)
    })
  })

  describe("pedidoParaIA", () => {
    const pedido = (enNeuronaPropia: boolean): string =>
      pedidoParaIA({
        paleta: PALETA, modo: "oscuro", propuestas: props(), enNeuronaPropia, contexto: "perfil",
        adn: BASE.adn,
        gustos: { publicos: ["le gusta el cristal"], privados: ["prefiere bordes rectos"] },
      })

    it("describe el fondo, las propuestas y las guardas del contrato", () => {
      const texto = pedido(false)
      expect(texto).toContain("#00f0ff")
      expect(texto).toContain("Sobria")
      expect(texto).toContain("AA")
      expect(texto).toContain("44 px")
      expect(texto).toContain("no ocultes ni desactives")
    })

    it("incluye gustos privados solo en una neurona de la persona", () => {
      expect(pedido(false)).not.toContain("prefiere bordes rectos")
      expect(pedido(false)).toContain("no incluidos")
      expect(pedido(true)).toContain("prefiere bordes rectos")
      expect(pedido(true)).toContain("le gusta el cristal")
    })
  })
})
