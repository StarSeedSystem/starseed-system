/// <reference lib="dom" />

export type EjemploLibreta = {
  punto: string
  ambito: string
  estado: string
  respuesta: string
  desenlaceOk: boolean | null
}

export type Vecino = {
  ejemplo: EjemploLibreta
  distancia: number
}

export function huellaPalabras(texto: string): number[] {
  const palabras = texto
    .toLowerCase()
    .replace(/[^a-z0-9áéíóúñ\s]/g, "")
    .split(/\s+/)
    .filter((p) => p.length > 2)
  const hash = new Set<number>()
  const vector: number[] = new Array(256).fill(0)
  for (const p of palabras) {
    let h = 0
    for (let i = 0; i < p.length; i++) {
      h = ((h << 5) - h + p.charCodeAt(i)) | 0
    }
    const idx = Math.abs(h) % 256
    if (!hash.has(idx)) {
      hash.add(idx)
      vector[idx] = (vector[idx] || 0) + 1
    }
  }
  return vector
}

export function similitud(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < 256; i++) {
    dot += a[i] * b[i]
    normA += a[i] ** 2
    normB += b[i] ** 2
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function vecinos(
  libreta: EjemploLibreta[],
  estado: string,
  k: number,
  ambito: string
): Vecino[] {
  const candidatos: Vecino[] = []
  for (const ejemplo of libreta) {
    if (ejemplo.ambito !== ambito || ejemplo.desenlaceOk === null) continue
    const huella = huellaPalabras(ejemplo.punto)
    const dist = similitud(huella, huellaPalabras(estado))
    candidatos.push({ ejemplo, distancia: dist })
  }
  candidatos.sort((a, b) => a.distancia - b.distancia)
  return candidatos.slice(0, k)
}

export function votar(vecinos: Vecino[]): { respuesta: string; apoyo: number } | null {
  if (vecinos.length < 5) return null
  const votos = new Map<string, number>()
  for (const v of vecinos) {
    const r = v.ejemplo.respuesta
    votos.set(r, (votos.get(r) || 0) + 1)
  }
  let mejorRespuesta = ""
  let mejorVotos = 0
  for (const [r, c] of votos) {
    if (c > mejorVotos) {
      mejorVotos = c
      mejorRespuesta = r
    }
  }
  const apoyo = mejorVotos / vecinos.length
  if (apoyo < 0.6) return null
  return { respuesta: mejorRespuesta, apoyo }
}