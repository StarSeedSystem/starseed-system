/* rediseno-desde-fondo — Ola 1018F (tarea L) · architecture/fondos-shaders.md §4
 * PURO: paleta del fondo → tres ThemeTokens (sobria, armónica, atrevida) con superficies
 * translúcidas, acentos de la paleta y escala φ; sin DOM, red ni disco. */
import type { ThemeTokens } from "./theme-engine"
import { luminanciaDe, normalizarHex, type EntradaPaleta } from "./paleta-fondo"
export type Modo = "claro" | "oscuro"
export interface AdnDiseno { energia?: number; adjetivos?: string[]; firmas?: string[]; prohibiciones?: string[]; jugadaRara?: string }
export interface EntradaRediseno { paleta: EntradaPaleta[]; temaActual: ThemeTokens; modo: Modo; adn?: AdnDiseno }
export interface PropuestaRediseno {
  id: "sobria" | "armonica" | "atrevida"; nombre: string; motivo: string; tokens: ThemeTokens; contraste: number; alfa: number
}
export interface GustoMemoria { texto: string; visibilidad: "privado" | "grupo" | "publico" }
export interface EntradaPedido {
  propuestas: PropuestaRediseno[]; paleta: EntradaPaleta[]; modo: Modo; adn?: AdnDiseno
  memoriaGustos?: GustoMemoria[]; enNeuronaPropia?: boolean; contexto?: "propio" | "compartido"
}
export interface PedidoIA { instruccion: string; incluyePrivado: boolean; gustosUsados: string[] }
type Rgb = [number, number, number]
const PHI = 1.618
const NEUTRO: EntradaPaleta = { color: "#7f8c9b", peso: 1 }
const aRgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(normalizarHex(h).slice(i, i + 2), 16)) as Rgb
const aHex = (r: Rgb): string =>
  `#${r.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`
const mezcla = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => v * (1 - t) + b[i] * t) as Rgb
/** Contraste WCAG real entre dos #rrggbb (1:1 a 21:1). */
export function ratioContraste(a: string, b: string): number {
  const [x, y] = [luminanciaDe(a), luminanciaDe(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
/** Compone un color translúcido (alfa 0–1) sobre un fondo opaco. */
export function componerAlfa(color: string, alfa: number, fondo: string): string {
  return aHex(mezcla(aRgb(fondo), aRgb(color), alfa))
}
/** HSL (0–360, %, %) de un #rrggbb, en el formato de los tokens --*-hsl. */
export function hslDe(color: string): [number, number, number] {
  const [r, g, b] = aRgb(color).map((v) => v / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  const l = (max + min) / 2
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  const h = d === 0 ? 0 : max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
  return [Math.round((h + 360) % 360), Math.round(s * 100), Math.round(l * 100)]
}
const hs = ([h, s, l]: [number, number, number]): string => `${h} ${s}% ${l}%`
/** Texto AA sobre TODAS las superficies compuestas: elige el extremo que
 *  maximiza el peor contraste y lo tiñe sin bajar de 4,5:1. */
function textoAA(fondos: string[]): { color: string; ratio: number } {
  const extremos: Rgb[] = [[12, 12, 16], [248, 248, 250]]
  const peor = (base: Rgb): number => Math.min(...fondos.map((f) => ratioContraste(aHex(base), f)))
  const base = peor(extremos[0]) >= peor(extremos[1]) ? extremos[0] : extremos[1]
  const tinte = mezcla(base, aRgb(fondos[0]), 0.12)
  const elegido = peor(tinte) >= 4.6 ? tinte : base
  return { color: aHex(elegido), ratio: peor(elegido) }
}
const RECETAS: Array<{ id: PropuestaRediseno["id"]; nombre: string; motivo: string; alfa: number; paso: number; ritmo: number }> = [
  { id: "sobria", nombre: "Sobria", alfa: 0.82, paso: 1, ritmo: 0.6, motivo: "Vesica piscis: dos dominios que se tocan, una línea de luz y vacío alrededor." },
  { id: "armonica", nombre: "Armónica", alfa: 0.7, paso: 2, ritmo: 1, motivo: "Espiral áurea: el foco en la intersección φ y el espaciado en Fibonacci." },
  { id: "atrevida", nombre: "Atrevida", alfa: 0.55, paso: 3, ritmo: 1.4, motivo: "Metatrón: red de nodos sobre el fondo; el acento traza el camino de lectura." },
]
/** Tres propuestas de tokens adaptadas al fondo. Ajusta el alfa de la
 *  superficie hasta que el texto pase AA; si aun así no pasa, la descarta. */
export function propuestasDesdeFondo(e: EntradaRediseno): PropuestaRediseno[] {
  const paleta = e.paleta.length ? e.paleta.slice(0, 6) : [NEUTRO]
  const ancla: Rgb = e.modo === "claro" ? [252, 250, 246] : [10, 12, 18]
  const dominante = paleta[0].color
  const orden = [...paleta].sort((a, b) => hslDe(b.color)[1] - hslDe(a.color)[1] || b.peso - a.peso)
  const primario = orden[0].color, acento = (orden[1] ?? orden[0]).color
  const energia = Math.max(0, Math.min(10, e.adn?.energia ?? 5))
  const nota = [e.adn?.adjetivos?.join(", "), e.adn?.jugadaRara].filter(Boolean).join("; ")
  return RECETAS.map((r) => {
    const superficie = aHex(mezcla(aRgb(dominante), ancla, e.modo === "claro" ? 0.78 : 0.82))
    let alfa = r.alfa, texto = textoAA(paleta.map((p) => componerAlfa(superficie, alfa, p.color)))
    while (texto.ratio < 4.6 && alfa < 0.97) {
      alfa = Math.min(0.97, alfa + 0.05)
      texto = textoAA(paleta.map((p) => componerAlfa(superficie, alfa, p.color)))
    }
    const fg = textoAA([primario]).color, fgAcento = textoAA([acento]).color
    const vars: Record<string, string> = {
      ...e.temaActual.vars,
      "background-hsl": hs(hslDe(aHex(mezcla(aRgb(dominante), ancla, 0.5)))),
      "foreground-hsl": hs(hslDe(texto.color)),
      "card-hsl": hs(hslDe(superficie)), "card-foreground-hsl": hs(hslDe(texto.color)),
      "popover-hsl": hs(hslDe(superficie)), "popover-foreground-hsl": hs(hslDe(texto.color)),
      "primary-hsl": hs(hslDe(primario)), "primary-foreground-hsl": hs(hslDe(fg)),
      "secondary-hsl": hs(hslDe(aHex(mezcla(aRgb(primario), ancla, 0.45)))), "secondary-foreground-hsl": hs(hslDe(fg)),
      "accent-hsl": hs(hslDe(acento)), "accent-foreground-hsl": hs(hslDe(fgAcento)),
      "muted-hsl": hs(hslDe(superficie)), "muted-foreground-hsl": hs(hslDe(texto.color)),
      "border-hsl": hs(hslDe(aHex(mezcla(aRgb(texto.color), aRgb(superficie), 0.6)))), "ring-hsl": hs(hslDe(primario)),
      "surface-alpha": String(alfa), "background-alpha": "0",
      "glass-opacity": String(alfa), "glass-blur": `${10 + r.paso * 6}px`, "glass-saturation": "140%",
      phi: String(PHI), "fs-phi-1": `${PHI}rem`, "fs-phi-2": `${(PHI ** 2).toFixed(3)}rem`, "fs-phi-3": `${(PHI ** 3).toFixed(3)}rem`,
      radius: `${(0.5 * PHI ** r.paso).toFixed(3)}rem`,
    }
    return {
      id: r.id, nombre: r.nombre, motivo: nota ? `${r.motivo} · ADN: ${nota}` : r.motivo,
      tokens: {
        ...e.temaActual, vars, materialClass: e.temaActual.materialClass ?? "ss-crystal",
        motion: Math.min(2, Math.max(0, (e.temaActual.motion ?? 1) * r.ritmo * (0.7 + energia * 0.06))),
      },
      contraste: texto.ratio, alfa,
    }
  }).filter((p) => p.contraste >= 4.5)
}
/** Pedido al Director de diseño. La memoria privada solo entra si el pedido
 *  corre en una neurona de la persona y el contexto es propio; nunca en uno
 *  compartido. */
export function pedidoParaIA(e: EntradaPedido): PedidoIA {
  const propia = e.enNeuronaPropia === true && (e.contexto ?? "propio") === "propio"
  const gustos = (e.memoriaGustos ?? []).filter((g) => g.visibilidad !== "privado" || propia)
  const lineas = [
    "Rediseña la página o el perfil a partir de su fondo, sin ocultar ni desactivar controles esenciales.",
    `Modo ${e.modo}. Paleta: ${e.paleta.map((p) => `${p.color} ${p.peso}`).join(", ") || NEUTRO.color}.`,
    ...e.propuestas.map((p) => `${p.nombre} (${p.id}, ${p.contraste.toFixed(2)}:1, alfa ${p.alfa.toFixed(2)}): ${p.motivo}`),
    e.adn?.firmas?.length ? `Firmas del ADN: ${e.adn.firmas.join("; ")}.` : "",
    e.adn?.prohibiciones?.length ? `Prohibiciones: ${e.adn.prohibiciones.join("; ")}.` : "",
    gustos.length ? `Gustos: ${gustos.map((g) => g.texto).join("; ")}.` : "",
    "Verifica contraste AA, dianas de 44 px y la matriz de pantallas antes de devolver.",
  ].filter(Boolean)
  const incluyePrivado = propia && (e.memoriaGustos ?? []).some((g) => g.visibilidad === "privado")
  return { instruccion: lineas.join("\n"), gustosUsados: gustos.map((g) => g.texto), incluyePrivado }
}
