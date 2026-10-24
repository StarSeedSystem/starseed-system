/** Paleta del fondo (Ola 1018F, tarea M) · architecture/fondos-shaders.md §4:
 *  sale de los colores del preset y de una muestra del fotograma. Módulo puro,
 *  sin red ni disco ni DOM, determinista (k-medias de semillas fijas). */
export interface ComponenteShader { type: string; props?: Record<string, unknown>; children?: ComponenteShader[] }
export interface PresetShader { components: ComponenteShader[]; structureVersion?: string }
export interface CapaFondo { tipo: string; preset?: PresetShader; color?: string; props?: Record<string, unknown> }
export interface SetFondo { motorBase?: { color?: string }; capas?: CapaFondo[] }
export interface EntradaPaleta { color: string; peso: number }

type Triple = [number, number, number]
const HEX_CORTO = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const HEX_GRANDE = /^#([0-9a-f]{6,8})$/i
const ITERACIONES_KMEDIAS = 10

/** #rgb, #rrggbb o #rrggbbaa (para la paleta se ignora la alfa). */
export const esHexColor = (valor: unknown): valor is string =>
  typeof valor === "string" && (HEX_CORTO.test(valor) || HEX_GRANDE.test(valor))

/** Devuelve siempre #rrggbb en minúsculas: expande #rgb y trunca la alfa. */
export function normalizarHex(color: string): string {
  const c = HEX_CORTO.exec(color)
  if (!c) return `#${color.replace("#", "").slice(0, 6).toLowerCase()}`
  const [a, b, d] = [c[1], c[2], c[3]]
  return `#${a}${a}${b}${b}${d}${d}`.toLowerCase()
}
/** Luminancia relativa WCAG de un #rrggbb, con canal srgb linealizado. */
export function luminanciaDe(color: string): number {
  const hex = normalizarHex(color).slice(1)
  const canal = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = [0, 2, 4].map((i) => canal(parseInt(hex.slice(i, i + 2), 16)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Recorre strings, arrays y objetos y recoge los valores que son color. */
export function recogerColores(valor: unknown, salida: string[] = []): string[] {
  if (esHexColor(valor)) salida.push(normalizarHex(valor))
  else if (Array.isArray(valor)) for (const v of valor) recogerColores(v, salida)
  else if (valor && typeof valor === "object")
    for (const v of Object.values(valor as Record<string, unknown>)) recogerColores(v, salida)
  return salida
}
/** Colores únicos de las props del preset, en orden de aparición. */
export function paletaDePreset(preset: PresetShader): string[] {
  const unicos: string[] = []
  const crudos = (preset.components ?? []).flatMap((c) =>
    recogerColores({ props: c.props, children: c.children }))
  for (const color of crudos) if (!unicos.includes(color)) unicos.push(color)
  return unicos
}
/** Píxeles RGBA válidos (alfa ≥ 128) como tríos RGB; descarta sueltos. */
function muestrasDe(pixeles: ArrayLike<number>): Triple[] {
  const lista: Triple[] = []
  const n = Math.floor(pixeles.length / 4) * 4
  for (let i = 0; i < n; i += 4) {
    if (pixeles[i + 3] >= 128) lista.push([pixeles[i], pixeles[i + 1], pixeles[i + 2]])
  }
  return lista
}

const luz = (t: Triple): number => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2]
const cerca = (a: Triple, b: Triple): number => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
const masCercano = (m: Triple, cs: Triple[]): number => {
  let mejor = 0
  for (let c = 1; c < cs.length; c++) if (cerca(m, cs[c]) < cerca(m, cs[mejor])) mejor = c
  return mejor
}
const hexDe = (t: Triple): string => `#${t.map((v) => v.toString(16).padStart(2, "0")).join("")}`

/** Agrupa la muestra del fotograma en k colores dominantes: k-medias con
 *  semillas fijas (centiles de luminancia), sin aleatoriedad de ningún tipo. */
export function paletaDeMuestra(pixeles: ArrayLike<number>, k = 5): EntradaPaleta[] {
  const muestras = muestrasDe(pixeles)
  if (muestras.length === 0) return []
  const grupos = Math.max(1, Math.min(k, muestras.length))
  const porLuz = [...muestras].sort((p, q) => luz(p) - luz(q))
  let centroides: Triple[] = Array.from({ length: grupos }, (_, j) =>
    grupos === 1 ? { ...porLuz[0] } : ([...porLuz[Math.floor((j * (muestras.length - 1)) / (grupos - 1))]] as Triple))
  for (let it = 0; it < ITERACIONES_KMEDIAS; it++) {
    const bolsas: Triple[][] = centroides.map(() => [])
    for (const m of muestras) bolsas[masCercano(m, centroides)].push(m)
    centroides = centroides.map((c, i) => {
      const b = bolsas[i]
      if (b.length === 0) return c
      const suma = b.reduce((a, m) => [a[0] + m[0], a[1] + m[1], a[2] + m[2]] as Triple, [0, 0, 0])
      return suma.map((v) => Math.round(v / b.length)) as Triple
    })
  }
  const porCentro = new Map<string, number>()
  for (const m of muestras) {
    const hex = hexDe(centroides[masCercano(m, centroides)])
    porCentro.set(hex, (porCentro.get(hex) ?? 0) + 1)
  }
  return ordenar(normalizarPesos([...porCentro]))
}
/** Peso normalizado (0–1) de cada color sobre el total. */
function normalizarPesos(pares: [string, number][]): EntradaPaleta[] {
  const total = pares.reduce((s, [, v]) => s + v, 0)
  if (total === 0) return []
  const norm = (crudo: number): number => Math.round((crudo / total) * 1000) / 1000
  return pares.map(([color, crudo]) => ({ color, peso: norm(crudo) }))
}
/** Orden estable de paleta: mayor peso primero; a igualdad, más luz primero. */
function ordenar(paleta: EntradaPaleta[]): EntradaPaleta[] {
  return [...paleta].sort((a, b) => b.peso - a.peso || luminanciaDe(b.color) - luminanciaDe(a.color))
}
/** Fusión de paleta del set: motor base (peso 2), colores de preset de cada
 *  capa (peso 1) y, si hay, la muestra del fotograma por su recuento (§4). */
export function paletaFondo(set?: SetFondo | null, muestra?: ArrayLike<number>): EntradaPaleta[] {
  const crudos = new Map<string, number>()
  const sumar = (color: string | undefined, peso: number) => {
    if (!color) return
    const hex = normalizarHex(color)
    crudos.set(hex, (crudos.get(hex) ?? 0) + peso)
  }
  sumar(set?.motorBase?.color, 2)
  for (const capa of set?.capas ?? []) {
    sumar(capa.color, 1)
    for (const color of paletaDePreset(capa.preset ?? { components: [] })) sumar(color, 1)
  }
  for (const e of paletaDeMuestra(muestra ?? [])) sumar(e.color, e.peso * 100)
  return ordenar(normalizarPesos([...crudos]))
}
