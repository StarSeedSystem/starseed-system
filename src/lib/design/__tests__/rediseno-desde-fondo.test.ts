import { describe, it, expect } from "vitest"
import {
  propuestasDesdeFondo,
  pedidoParaIA,
  contrasteEntre,
  type AdnDiseno,
  type EntradaRediseno,
  type PropuestaDiseno,
} from "../rediseno-desde-fondo"
import type { EntradaPaleta } from "../paleta-fondo"
import type { ThemeTokens } from "../theme-engine"

const PALETA: EntradaPaleta[] = [
  { color: "#0a0e27", peso: 0.5 },
  { color: "#10b981", peso: 0.3 },
  { color: "#ffbf00", peso: 0.15 },
  { color: "#007fff", peso: 0.05 },
]
const TEMA: ThemeTokens = {
  vars: { "background-hsl": "228 50% 4%", "card-hsl": "228 46% 7%", "radius": "20px" },
  materialClass: "ss-crystal",
  fontFamily: "Inter",
  motion: 0.6,
  background: "weather-live",
}
const ADN: AdnDiseno = {
  identidad: "Astraura",
  motivo: "metatrón",
  tipografia: "Rajdhani",
  material: "ss-crystal",
  radios: [4, 12, 24],
  gustos: ["le gusta el vidrio"],
  privados: ["prefiere no compartir su ciudad"],
}

function desde(modo: "claro" | "oscuro", adn?: AdnDiseno | null): PropuestaDiseno[] {
  const entrada: EntradaRediseno = { paleta: PALETA, temaActual: TEMA, modo, adn }
  return propuestasDesdeFondo(entrada)
}

describe("propuestasDesdeFondo", () => {
  it("devuelve tres propuestas con sus motivos y la escala φ", () => {
    const tres = desde("oscuro")
    expect(tres.map((p) => p.id)).toEqual(["sobria", "armonica", "atrevida"])
    expect(tres.map((p) => p.motivo)).toEqual(["vesica piscis", "espiral áurea", "flor de la vida"])
    for (const p of tres) {
      expect(p.tokens.vars["phi"]).toBe("1.618")
      expect(p.tokens.vars["fs-phi-1"]).toBe("1.618rem")
      expect(p.tokens.vars["fib-21"]).toBe("21px")
    }
  })

  it("deja ver el fondo con superficies translúcidas y conserva el tema actual", () => {
    for (const p of desde("oscuro")) {
      expect(p.tokens.vars["card-hsl"]).toContain("/ 0.")
      expect(Number(p.tokens.vars["glass-opacity"])).toBeGreaterThan(0)
      expect(Number(p.tokens.vars["glass-opacity"])).toBeLessThan(1)
      expect(p.muestra.superficie).not.toBe(p.muestra.fondo)
      expect(p.tokens.background).toBe("weather-live")
      expect(p.tokens.materialClass).toBe("ss-crystal")
    }
  })

  it("toma los acentos de la paleta del fondo", () => {
    const colores = PALETA.map((e) => e.color)
    for (const p of desde("oscuro")) {
      expect(p.acentos).toHaveLength(3)
      expect(colores).toContain(p.acentos[0])
    }
  })

  it("verifica AA entre texto y superficie compuesta en claro y oscuro", () => {
    for (const modo of ["claro", "oscuro"] as const) {
      for (const p of desde(modo)) {
        expect(p.contraste).toBeGreaterThanOrEqual(4.5)
        expect(contrasteEntre(p.muestra.texto, p.muestra.superficie)).toBe(p.contraste)
        expect(p.tokens.vars["foreground-hsl"]).toBeTruthy()
        expect(p.tokens.vars["card-foreground-hsl"]).toBeTruthy()
      }
    }
  })

  it("es determinista y usa la identidad, el motivo y los radios del ADN", () => {
    expect(desde("oscuro", ADN)).toEqual(desde("oscuro", ADN))
    const tres = desde("oscuro", ADN)
    expect(tres[0].nombre).toContain("Astraura")
    expect(tres[1].motivo).toBe("metatrón")
    expect(tres.map((p) => p.tokens.vars["radius"])).toEqual(["4px", "12px", "24px"])
    expect(tres.every((p) => p.tokens.fontFamily === "Rajdhani")).toBe(true)
  })

  it("sigue dando tres propuestas sin paleta y en modo claro", () => {
    expect(propuestasDesdeFondo({ paleta: [], temaActual: TEMA, modo: "claro" })).toHaveLength(3)
  })
})

describe("pedidoParaIA", () => {
  const propuestas = desde("oscuro", ADN)
  it("incluye gustos públicos, omite los privados y lo explica", () => {
    const pedido = pedidoParaIA({ propuestas, contexto: "una página", adn: ADN })
    expect(pedido.incluyePrivado).toBe(false)
    expect(pedido.texto).toContain("le gusta el vidrio")
    expect(pedido.texto).not.toContain("prefiere no compartir su ciudad")
    expect(pedido.notaPrivacidad).toContain("omitida")
  })

  it("incluye lo privado solo en una neurona de la persona", () => {
    const pedido = pedidoParaIA({ propuestas, adn: ADN, enNeuronaPropia: true })
    expect(pedido.incluyePrivado).toBe(true)
    expect(pedido.texto).toContain("prefiere no compartir su ciudad")
    expect(pedido.notaPrivacidad).toContain("incluida")
  })

  it("pide las tres propuestas con sus motivos, AA y escala φ", () => {
    const texto = pedidoParaIA({ propuestas, adn: ADN }).texto
    for (const p of propuestas) expect(texto).toContain(p.motivo)
    expect(texto).toContain("AA")
    expect(texto).toContain("φ")
  })
})
