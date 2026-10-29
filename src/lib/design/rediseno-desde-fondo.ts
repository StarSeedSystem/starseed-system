/** Tres propuestas de rediseño adaptadas al fondo (Ola 1018F, tarea L) ·
 *  architecture/fondos-shaders.md §4 y architecture/director-diseno.md §9.
 *  Módulo PURO: sin red, sin disco y sin DOM; entrada → salida determinista. */
import type { ThemeTokens } from "./theme-engine"
import type { EntradaPaleta } from "./paleta-fondo"
import { luminanciaDe, normalizarHex } from "./paleta-fondo"

export type Modo = "claro" | "oscuro"
export type IdPropuesta = "sobria" | "armonica" | "atrevida"
export type Triple = [number, number, number]

export interface AdnDiseno {
    identidad?: string
    motivos?: string[]
    tipografia?: string
    radioBase?: number
    prohibiciones?: string[]
}

export interface ContrasteAA {
    texto: string
    superficie: string
    ratio: number
    aa: boolean
}

export interface PropuestaRediseno {
    id: IdPropuesta
    nombre: string
    motivo: string
    descripcion: string
    tokens: ThemeTokens
    contraste: ContrasteAA
    ajustes: string[]
}

export interface EntradaPropuestas {
    paleta: EntradaPaleta[]
    temaActual: ThemeTokens
    modo: Modo
    adn?: Partial<AdnDiseno> | null
}

export interface Gustos {
    publicos?: string[]
    privados?: string[]
}

export interface EntradaPedidoIA {
    paleta: EntradaPaleta[]
    modo: Modo
    propuestas: PropuestaRediseno[]
    adn?: Partial<AdnDiseno> | null
    gustos?: Gustos | null
    enNeuronaPropia: boolean
    contexto?: string
}

export const PHI = 1.618

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n))

/** Hex → [tono 0–360, saturación %, luz %] (convención HSL del OS). */
export function hexAHsl(hex: string): Triple {
    const n = normalizarHex(hex).slice(1)
    const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16) / 255)
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    if (d === 0) return [0, 0, Math.round(l * 100)]
    const s = d / (1 - Math.abs(2 * l - 1))
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    return [Math.round((((h * 60) % 360) + 360) % 360), Math.round(s * 100), Math.round(l * 100)]
}

export function hslAHex([h, s, l]: Triple): string {
    const S = clamp(s, 0, 100) / 100
    const L = clamp(l, 0, 100) / 100
    const c = (1 - Math.abs(2 * L - 1)) * S
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = L - c / 2
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
        : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
    const hex = [r, g, b].map((v) => Math.round(clamp(v + m, 0, 1) * 255).toString(16).padStart(2, "0"))
    return `#${hex.join("")}`
}

export function contrasteHex(a: string, b: string): number {
    const [alta, baja] = [luminanciaDe(a), luminanciaDe(b)].sort((p, q) => q - p)
    return Math.round(((alta + 0.05) / (baja + 0.05)) * 100) / 100
}

/** Escala tipográfica φ de memory/diseno/armonia.md, con máximos a razón φ. */
export function escalaPhi(): Record<string, string> {
    const out: Record<string, string> = {}
    for (let exp = -2; exp <= 4; exp++) {
        const max = Math.round(16 * PHI ** exp * 1000) / 1000
        out[`fs-phi-${exp}`] = `clamp(${(max / PHI).toFixed(3)}rem, ${(max * 0.75).toFixed(3)}rem + 1vw, ${max.toFixed(3)}rem)`
    }
    return out
}

const rgbDe = (hex: string): Triple => {
    const n = normalizarHex(hex).slice(1)
    return [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16)) as Triple
}

function mezclar(a: string, b: string, alfa: number): string {
    const [x, y] = [rgbDe(a), rgbDe(b)]
    const hex = x.map((v, i) => Math.round(v * alfa + y[i] * (1 - alfa)).toString(16).padStart(2, "0"))
    return `#${hex.join("")}`
}

const hslStringATriple = (s: string): Triple | null => {
    const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%/.exec(s.trim())
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

const fondoDominante = (e: EntradaPropuestas): string =>
    e.paleta[0]?.color ? normalizarHex(e.paleta[0].color) : e.modo === "oscuro" ? "#0a0f1d" : "#fdf7ea"

function superficie(e: EntradaPropuestas): string {
    const colores = e.paleta.map((p) => normalizarHex(p.color))
    if (colores.length === 0) return e.modo === "oscuro" ? "#101729" : "#fbfbfd"
    const orden = [...colores].sort((a, b) => luminanciaDe(a) - luminanciaDe(b))
    const [h, s, l] = hexAHsl(e.modo === "oscuro" ? orden[0] : orden[orden.length - 1])
    return e.modo === "oscuro"
        ? hslAHex([h, clamp(s, 12, 60), clamp(l, 8, 26)])
        : hslAHex([h, clamp(s, 8, 45), clamp(l, 80, 95)])
}

function textoLegible(sup: string, hue: number): { hex: string; ajustado: boolean } {
    const oscuro = luminanciaDe(sup) > 0.18
    for (let i = 0; i <= 40; i++) {
        const l = oscuro ? 12 - i * 0.3 : 92 + i * 0.2
        const hex = hslAHex([hue, clamp(10 + i / 4, 8, 24), l])
        if (contrasteHex(hex, sup) >= 4.5) return { hex, ajustado: i > 0 }
    }
    return { hex: oscuro ? "#000000" : "#ffffff", ajustado: true }
}

function acentos(e: EntradaPropuestas, n: number): string[] {
    const paleta = e.paleta.map((p) => normalizarHex(p.color))
    const fondo = fondoDominante(e)
    const vivos = paleta.filter((c) => c !== fondo).sort((a, b) => hexAHsl(b)[1] - hexAHsl(a)[1])
    const tema = ["primary-hsl", "secondary-hsl", "accent-hsl"].flatMap((k) => {
        const t = hslStringATriple(e.temaActual.vars[k] ?? "")
        return t ? [hslAHex(t)] : []
    })
    const fuente = vivos.length > 0 ? vivos : paleta.length > 0 ? paleta
        : tema.length > 0 ? tema : ["#00f0ff", "#d4af37", "#a855f7"]
    return Array.from({ length: n }, (_, i) => fuente[i % fuente.length])
}

interface Perfil {
    id: IdPropuesta; nombre: string; motivo: string; descripcion: string
    alfa: number; motion: number; radio: number; nAcentos: number; material: string
    blur: number; neon: number
}

const PERFILES: Perfil[] = [
    { id: "sobria", nombre: "Sobria", motivo: "vesica piscis", descripcion: "Un solo acento y superficies casi opacas: el fondo se intuye y el contenido manda.", alfa: 0.84, motion: 0.55, radio: 1, nAcentos: 1, material: "ss-crystal", blur: 18, neon: 0.15 },
    { id: "armonica", nombre: "Armónica", motivo: "espiral áurea", descripcion: "Dos acentos y radios en φ: ritmo áureo con el fondo visible bajo un velo de cristal.", alfa: 0.68, motion: 1, radio: PHI, nAcentos: 2, material: "ss-crystal", blur: 24, neon: 0.4 },
    { id: "atrevida", nombre: "Atrevida", motivo: "metatrón", descripcion: "Tres acentos, más transparencia y movimiento: el fondo forma parte del diseño.", alfa: 0.52, motion: 1.6, radio: PHI ** 2, nAcentos: 3, material: "ss-neon", blur: 32, neon: 0.85 },
]

function construir(e: EntradaPropuestas, p: Perfil, i: number): PropuestaRediseno {
    const sup = mezclar(superficie(e), fondoDominante(e), p.alfa)
    const supHsl = hexAHsl(sup)
    const fg = textoLegible(sup, supHsl[0])
    const fgHsl = hexAHsl(fg.hex)
    const prioridad = acentos(e, p.nAcentos).map((hex) => {
        const [h, s, l] = hexAHsl(hex)
        const [sMin, sMax] = p.id === "sobria" ? [20, 55] : p.id === "armonica" ? [35, 75] : [55, 95]
        return hslAHex([h, clamp(s, sMin, sMax), clamp(l, e.modo === "oscuro" ? 55 : 38, e.modo === "oscuro" ? 72 : 52)])
    })
    const [prim, sec, acc] = [prioridad[0], prioridad[1] ?? prioridad[0], prioridad[2] ?? prioridad[1] ?? prioridad[0]]
    const alfa = (v: number): string => `${supHsl[0]} ${supHsl[1]}% ${supHsl[2]}% / ${Math.round(v * 100) / 100}`
    const fgVar = `${fgHsl[0]} ${fgHsl[1]}% ${fgHsl[2]}%`
    const par = (color: string): { hsl: string; fg: string } => {
        const [h, s, l] = hexAHsl(color)
        const [fh, fs, fl] = hexAHsl(textoLegible(color, h).hex)
        return { hsl: `${h} ${s}% ${l}%`, fg: `${fh} ${fs}% ${fl}%` }
    }
    const [pPrim, pSec, pAcc] = [par(prim), par(sec), par(acc)]
    const vars: Record<string, string> = {
        "card-hsl": alfa(p.alfa), "card-foreground-hsl": fgVar,
        "popover-hsl": alfa(Math.min(0.98, p.alfa + 0.08)), "popover-foreground-hsl": fgVar,
        "muted-hsl": alfa(Math.max(0.4, p.alfa - 0.15)), "muted-foreground-hsl": fgVar,
        "primary-hsl": pPrim.hsl, "primary-foreground-hsl": pPrim.fg, "primary-rgb": rgbDe(prim).join(", "),
        "secondary-hsl": pSec.hsl, "secondary-foreground-hsl": pSec.fg,
        "accent-hsl": pAcc.hsl, "accent-foreground-hsl": pAcc.fg,
        "border-hsl": `${supHsl[0]} ${clamp(supHsl[1], 8, 30)}% ${e.modo === "oscuro" ? 30 : 70}% / 0.35`,
        "input-hsl": `${supHsl[0]} ${clamp(supHsl[1], 8, 30)}% ${e.modo === "oscuro" ? 26 : 78}%`,
        "ring-hsl": pPrim.hsl,
        radius: `${Math.round(clamp((e.adn?.radioBase ?? 1.25) * p.radio, 0.25, 3) * 1000) / 1000}rem`,
        "glass-blur": `${p.blur}px`, "glass-opacity": String(p.alfa),
        "glass-frost": String(Math.round((1 - p.alfa) * 100) / 100),
        "glass-noise": p.id === "atrevida" ? "0.12" : "0.04",
        "border-width": p.id === "sobria" ? "1px" : "1.5px",
        "neon-glow": String(p.neon), phi: String(PHI),
        ...escalaPhi(),
    }
    const ratio = contrasteHex(fg.hex, sup)
    const ajustes: string[] = []
    if (fg.ajustado) ajustes.push("texto ajustado para alcanzar AA 4,5:1 sobre la superficie translúcida")
    if (e.paleta.length === 0) ajustes.push("sin paleta de fondo: acentos tomados del tema actual")
    if (ratio < 4.5) ajustes.push("descartada: no alcanza AA 4,5:1")
    return {
        id: p.id, nombre: p.nombre,
        motivo: e.adn?.motivos?.[i] ?? p.motivo,
        descripcion: p.descripcion,
        tokens: {
            ...e.temaActual,
            vars: { ...e.temaActual.vars, ...vars },
            materialClass: e.temaActual.materialClass ?? p.material,
            fontFamily: e.adn?.tipografia ?? e.temaActual.fontFamily,
            motion: p.motion,
        },
        contraste: { texto: fg.hex, superficie: sup, ratio, aa: ratio >= 4.5 },
        ajustes,
    }
}

export function propuestasDesdeFondo(e: EntradaPropuestas): PropuestaRediseno[] {
    return PERFILES.map((p, i) => construir(e, p, i))
}

export function pedidoParaIA(e: EntradaPedidoIA): string {
    const colores = e.paleta.map((p) => p.color).join(", ") || "sin paleta (se conserva el fondo actual)"
    const publicos = (e.gustos?.publicos ?? []).join("; ") || "sin gustos públicos"
    const privados = e.enNeuronaPropia
        ? (e.gustos?.privados ?? []).join("; ") || "sin gustos privados"
        : "no incluidos: este pedido no corre en una neurona de la persona"
    return [
        `Actúa como Director de diseño de StarSeed OS y rediseña ${e.contexto ?? "esta superficie"} adaptándola al fondo elegido (modo ${e.modo}).`,
        `Paleta del fondo: ${colores}.`,
        `ADN: identidad ${e.adn?.identidad ?? "StarSeed OS"}; motivos ${(e.adn?.motivos ?? []).join(", ") || "los de la identidad"}; tipografía ${e.adn?.tipografia ?? "la activa"}; prohibiciones ${(e.adn?.prohibiciones ?? []).join(", ") || "las de la identidad"}.`,
        `Memoria de gustos públicos: ${publicos}.`,
        `Memoria de gustos privados: ${privados}.`,
        `Propuestas calculadas: ${e.propuestas.map((p) => `${p.nombre} (${p.motivo}, AA ${p.contraste.ratio.toFixed(2)}:1)`).join("; ")}.`,
        "El fondo actual sigue siendo la opción principal; no ocultes ni desactives ningún control esencial; conserva AA ≥ 4,5:1, dianas ≥ 44 px, todas las pantallas y «deshacer».",
    ].join("\n")
}
