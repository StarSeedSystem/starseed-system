/* Rediseño desde el fondo (Ola 1018F, tarea L) · architecture/fondos-shaders.md §4: tres
 * propuestas con superficies translúcidas, escala φ, acentos de la paleta y contraste AA. */
import type { ThemeTokens } from "./theme-engine"
import type { EntradaPaleta } from "./paleta-fondo"
import { luminanciaDe, normalizarHex } from "./paleta-fondo"
export type NombrePropuesta = "sobria" | "armonica" | "atrevida"
export interface AdnDiseno { identidad?: string; motivo?: string; tipografia?: string; material?: string; radios?: number[]; gustos?: string[]; privados?: string[] }
export interface EntradaRediseno { paleta: EntradaPaleta[]; temaActual: ThemeTokens; modo: "claro" | "oscuro"; adn?: AdnDiseno | null }
export interface PropuestaDiseno { id: NombrePropuesta; nombre: string; motivo: string; tokens: ThemeTokens; contraste: number; muestra: { fondo: string; superficie: string; texto: string }; acentos: string[]; ajustes: string[] }
export interface EntradaPedido { propuestas: PropuestaDiseno[]; contexto?: string; adn?: AdnDiseno | null; enNeuronaPropia?: boolean }
export interface PedidoIA { texto: string; incluyePrivado: boolean; notaPrivacidad: string }
export interface Hsl { h: number; s: number; l: number }
const PERFILES = [{ id: "sobria", nombre: "Sobria", motivo: "vesica piscis", alfa: 0.44, radio: 12, motion: 0 }, { id: "armonica", nombre: "Armónica", motivo: "espiral áurea", alfa: 0.58, radio: 20, motion: 1 }, { id: "atrevida", nombre: "Atrevida", motivo: "flor de la vida", alfa: 0.72, radio: 28, motion: 1.6 }] as const
const ESCALA_PHI: Record<string, string> = {
  phi: "1.618", "fs-phi--2": "0.382rem", "fs-phi--1": "0.618rem", "fs-phi-1": "1.618rem",
  "fs-phi-2": "2.618rem", "fs-phi-3": "4.236rem", "fs-phi-4": "6.854rem", "fib-2": "2px", "fib-3": "3px",
  "fib-5": "5px", "fib-8": "8px", "fib-13": "13px", "fib-21": "21px", "fib-34": "34px", "fib-55": "55px", "fib-89": "89px", "fib-144": "144px" }
export function aHsl(hex: string): Hsl {
  const n = normalizarHex(hex).slice(1), [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2
  let h = 0
  if (d > 0) { h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360 }
  return { h, s: d === 0 ? 0 : (d / (1 - Math.abs(2 * l - 1))) * 100, l: l * 100 }
}
export function contrasteEntre(a: string, b: string): number {
  const [claro, oscuro] = [luminanciaDe(a), luminanciaDe(b)].sort((x, y) => y - x); return Math.round(((claro + 0.05) / (oscuro + 0.05)) * 100) / 100
}
function hexDe(c: Hsl): string {
  const h = ((c.h % 360) + 360) % 360, s = c.s / 100, l = c.l / 100
  const k = (n: number): number => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number): number => Math.round((l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255)
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, "0")).join("")}`
}
function token(c: Hsl, alfa?: number): string {
  const r = (v: number): number => Math.round(v * 10) / 10
  return `${Math.round(((c.h % 360) + 360) % 360)} ${r(c.s)}% ${r(c.l)}%${alfa === undefined ? "" : ` / ${alfa}`}`
}
function mezclar(frente: string, fondo: string, alfa: number): string {
  const [a, b] = [normalizarHex(frente).slice(1), normalizarHex(fondo).slice(1)]
  const canales = [0, 2, 4].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * alfa + parseInt(b.slice(i, i + 2), 16) * (1 - alfa)))
  return `#${canales.map((v) => v.toString(16).padStart(2, "0")).join("")}`
}
function baseYMatices(paleta: EntradaPaleta[], modo: "claro" | "oscuro"): { base: string; matices: string[] } {
  const unicos = [...new Set(paleta.filter((e) => e.peso > 0).map((e) => normalizarHex(e.color)))]
  const escoger = (a: string, b: string): string =>
    modo === "oscuro" ? (luminanciaDe(b) < luminanciaDe(a) ? b : a) : (luminanciaDe(b) > luminanciaDe(a) ? b : a)
  const base = unicos.length ? unicos.reduce(escoger) : (modo === "oscuro" ? "#0a0f1d" : "#f7f9fc")
  const matices = unicos.filter((c) => c !== base)
  if (matices.length === 0) matices.push(base)
  while (matices.length < 3) matices.push(hexDe({ ...aHsl(matices[matices.length - 1]), h: aHsl(matices[matices.length - 1]).h + 40 }))
  return { base, matices }
}
function acento(hex: string): { color: string; texto: string } {
  const c = aHsl(hex)
  let l = c.l
  for (let i = 0; i < 24; i++) {
    const fondo = hexDe({ ...c, l })
    const blanco = contrasteEntre("#ffffff", fondo), negro = contrasteEntre("#000000", fondo)
    if (Math.max(blanco, negro) >= 4.5) return { color: fondo, texto: blanco >= negro ? "#ffffff" : "#000000" }
    l = Math.max(4, Math.min(96, l + (blanco >= negro ? -3 : 3)))
  }
  return { color: hexDe({ ...c, l }), texto: "#ffffff" }
}
function textoAA(fondo: string): { hex: string; ratio: number } | null {
  const blanco = contrasteEntre("#ffffff", fondo) >= contrasteEntre("#000000", fondo), h = aHsl(fondo).h
  for (let i = 0; i < 24; i++) {
    const hex = hexDe({ h, s: 8, l: blanco ? 96 - i * 3 : 4 + i * 3 }), ratio = contrasteEntre(hex, fondo)
    if (ratio >= 4.5) return { hex, ratio }
  }
  return null
}
export function propuestasDesdeFondo(entrada: EntradaRediseno): PropuestaDiseno[] {
  const { paleta, temaActual, modo, adn } = entrada
  const { base: crudo, matices } = baseYMatices(paleta ?? [], modo)
  const c = aHsl(crudo)
  const fondo = hexDe({ h: c.h, s: Math.min(c.s, modo === "oscuro" ? 65 : 45), l: modo === "oscuro" ? Math.min(c.l, 12) : Math.max(c.l, 92) })
  const salida: PropuestaDiseno[] = []
  PERFILES.forEach((p, i) => {
    const acentos = [0, 1, 2].map((k) => acento(matices[(i + k) % matices.length]))
    const a = aHsl(acentos[0].color)
    const superficie = hexDe({ h: a.h, s: Math.min(a.s, 45), l: modo === "oscuro" ? Math.min(a.l, 30) : Math.max(a.l, 70) })
    const compuesta = mezclar(superficie, fondo, p.alfa), texto = textoAA(compuesta)
    if (!texto) return
    const [prim, seg, ter] = acentos
    const vars: Record<string, string> = {
      ...temaActual.vars, ...ESCALA_PHI,
      "background-hsl": token(aHsl(fondo)), "foreground-hsl": token(aHsl(texto.hex)),
      "card-hsl": `${token(aHsl(superficie))} / ${p.alfa}`, "card-foreground-hsl": token(aHsl(texto.hex)),
      "primary-hsl": token(aHsl(prim.color)), "primary-foreground-hsl": token(aHsl(prim.texto)),
      "secondary-hsl": token(aHsl(seg.color)), "secondary-foreground-hsl": token(aHsl(seg.texto)),
      "accent-hsl": token(aHsl(ter.color)), "accent-foreground-hsl": token(aHsl(ter.texto)),
      "muted-hsl": `${token(aHsl(superficie))} / ${Math.min(p.alfa + 0.1, 0.92)}`,
      "border-hsl": `${token(aHsl(prim.color))} / 0.35`, "ring-hsl": token(aHsl(prim.color)),
      "glass-opacity": String(p.alfa), radius: `${adn?.radios?.[i] ?? p.radio}px`,
    }
    const motivo = i === 1 && adn?.motivo ? adn.motivo : p.motivo
    salida.push({ id: p.id, nombre: adn?.identidad ? `${p.nombre} · ${adn.identidad}` : p.nombre, motivo, contraste: texto.ratio,
      muestra: { fondo, superficie: compuesta, texto: texto.hex }, acentos: acentos.map((x) => x.color),
      ajustes: [`Superficie translúcida al ${Math.round(p.alfa * 100)} % para dejar ver el fondo.`, `Texto a ${texto.ratio}:1 comprobado (AA).`],
      tokens: { ...temaActual, vars, materialClass: adn?.material ?? temaActual.materialClass ?? "ss-crystal", fontFamily: adn?.tipografia ?? temaActual.fontFamily, motion: p.motion } })
  })
  return salida
}
export function pedidoParaIA(entrada: EntradaPedido): PedidoIA {
  const { propuestas, contexto = "perfil", adn, enNeuronaPropia = false } = entrada
  const gustos = adn?.gustos ?? [], privados = adn?.privados ?? [], usarPrivado = enNeuronaPropia && privados.length > 0
  const memoria = [...gustos, ...(usarPrivado ? privados : [])], notaPrivacidad = privados.length === 0 ? "Sin memoria privada que aplicar."
    : usarPrivado ? "Memoria privada incluida: corre en una neurona de la persona." : "Memoria privada omitida: esta petición no corre en una neurona de la persona."
  const texto = [
    `Rediseña ${contexto} a partir del fondo elegido (${propuestas.length} propuestas).`,
    propuestas.map((p) => `· ${p.nombre}: motivo ${p.motivo}, contraste ${p.contraste}:1`).join("\n"),
    "Conserva visibles, funcionales y accesibles todos los controles esenciales.",
    "Solo tokens y variantes permitidas; el fondo actual sigue siendo la opción principal y las superficies dejan verlo.",
    "Contraste AA ≥ 4,5:1, escala φ, espaciado Fibonacci y adaptación a móvil, tablet, escritorio, plegable y TV.", memoria.length ? `Memoria de gustos: ${memoria.join("; ")}.` : "Sin memoria de gustos declarada.",
    `Privacidad: ${notaPrivacidad}`,
  ].join("\n")
  return { texto, incluyePrivado: usarPrivado, notaPrivacidad }
}
