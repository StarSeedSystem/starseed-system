import { describe, it, expect } from "vitest"
import {
  esHexColor,
  normalizarHex,
  luminanciaDe,
  recogerColores,
  paletaDePreset,
  paletaDeMuestra,
  paletaFondo,
} from "../paleta-fondo"
import type { PresetShader, SetFondo } from "../paleta-fondo"

function pixeles(bloques: [number, number, number, number, number][]): Uint8ClampedArray {
  const lista: number[] = []
  for (const [r, g, b, a, n] of bloques) for (let i = 0; i < n; i++) lista.push(r, g, b, a)
  return new Uint8ClampedArray(lista)
}

const MUESTRA_TEST = pixeles([[230, 57, 70, 255, 5], [30, 45, 120, 255, 1]])

describe("paleta-fondo", () => {
  describe("esHexColor y normalizarHex", () => {
    it("acepta #rgb, #rrggbb y #rrggbbaa; rechaza lo demás", () => {
      expect(esHexColor("#fc0")).toBe(true)
      expect(esHexColor("#10B981")).toBe(true)
      expect(esHexColor("#10B98180")).toBe(true)
      expect(esHexColor("azul")).toBe(false)
      expect(esHexColor("#12345")).toBe(false)
      expect(esHexColor(16)).toBe(false)
    })

    it("normaliza a #rrggbb en minúsculas", () => {
      expect(normalizarHex("#FC0")).toBe("#ffcc00")
      expect(normalizarHex("#10B981")).toBe("#10b981")
      expect(normalizarHex("#ABCDEF09")).toBe("#abcdef")
    })
  })

  describe("luminanciaDe", () => {
    it("crece del negro al blanco", () => {
      expect(luminanciaDe("#000000")).toBe(0)
      expect(luminanciaDe("#777777")).toBeGreaterThan(luminanciaDe("#000000"))
      expect(luminanciaDe("#ffffff")).toBeCloseTo(1, 2)
    })
  })

  describe("recogerColores y paletaDePreset", () => {
    const preset: PresetShader = {
      components: [
        {
          type: "degradado",
          props: { colorA: "#FC0", alfa: "#ABCDEF09", etiqueta: "aurora", velocidad: 0.4 },
          children: [{ type: "grano", props: { tinte: "#ffcc00", otro: "#007fff" } }],
        },
      ],
    }

    it("recoge colores anidados y deduplica en orden de aparición", () => {
      expect(recogerColores(preset.components[0].props)).toEqual(["#ffcc00", "#abcdef"])
      expect(paletaDePreset(preset)).toEqual(["#ffcc00", "#abcdef", "#007fff"])
    })
  })

  describe("paletaDeMuestra (k-medias determinista)", () => {
    it("devuelve [] sin muestras válidas", () => {
      expect(paletaDeMuestra(new Uint8ClampedArray(0))).toEqual([])
      expect(paletaDeMuestra(pixeles([[10, 20, 30, 40, 1]]))).toEqual([])
      expect(paletaDeMuestra(pixeles([[10, 20, 30, 255, 1]]), 0)).toHaveLength(1)
    })

    it("agrupa bloques de color y reparte pesos por recuento", () => {
      const paleta = paletaDeMuestra(MUESTRA_TEST, 2)
      expect(paleta).toHaveLength(2)
      const suma = paleta.reduce((s, e) => s + e.peso, 0)
      expect(suma).toBeCloseTo(1, 1)
      expect(paleta[0].peso).toBeGreaterThan(paleta[1].peso)
    })

    it("es determinista: dos llamadas iguales dan el mismo resultado", () => {
      expect(paletaDeMuestra(MUESTRA_TEST, 2)).toEqual(paletaDeMuestra(MUESTRA_TEST, 2))
    })

    it("k=1 devuelve un solo color", () => {
      expect(paletaDeMuestra(MUESTRA_TEST, 1)).toHaveLength(1)
    })
  })

  describe("paletaFondo (fusión set + muestra)", () => {
    const PRESET: PresetShader = {
      components: [{ type: "degradado", props: { colorA: "#10B981", paleta: ["#007FFF", "#FFBF00"] } }],
    }
    const SET: SetFondo = { motorBase: { color: "#0A0E27" }, capas: [{ tipo: "shader", preset: PRESET }] }
    const MUESTRA = pixeles([[16, 185, 129, 255, 6], [10, 14, 39, 255, 2]])

    it("fusiona motor base, capas y muestra en una sola paleta", () => {
      const colores = paletaFondo(SET, MUESTRA).map((e) => e.color)
      for (const esperado of ["#0a0e27", "#10b981", "#007fff", "#ffbf00"]) {
        expect(colores).toContain(esperado)
      }
      const suma = paletaFondo(SET, MUESTRA).reduce((s, e) => s + e.peso, 0)
      expect(suma).toBeCloseTo(1, 1)
    })

    it("ordena por peso y a igualdad por luminancia; la muestra manda", () => {
      const paleta = paletaFondo(SET, MUESTRA)
      for (let i = 1; i < paleta.length; i++) {
        expect(paleta[i].peso).toBeLessThanOrEqual(paleta[i - 1].peso)
      }
      expect(paleta[0].color).toBe("#10b981")
    })

    it("sin set ni muestra devuelve []", () => {
      expect(paletaFondo()).toEqual([])
      expect(paletaFondo(null)).toEqual([])
      expect(paletaFondo({ capas: [], motorBase: {} })).toEqual([])
    })
  })
})
