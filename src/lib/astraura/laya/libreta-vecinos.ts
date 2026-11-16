export interface EjemploLibreta {
  punto: string; // Representación vectorial o texto para hashing
  ambito: string;
  estado: string;
  respuesta: string;
  desenlaceOk: boolean | null;
}

export function huellaPalabras(texto: string): number[] {
  // Hash a vector disperso de tamaño 256
  const vector = new Array(256).fill(0);
  const palabras = texto.toLowerCase().split(/\W+/).filter(Boolean);
  
  for (const palabra of palabras) {
    let hash = 0;
    for (let i = 0; i < palabra.length; i++) {
      hash = (hash << 5) - hash + palabra.charCodeAt(i);
      hash |= 0;
    }
    const index = Math.abs(hash) % 256;
    vector[index] += 1;
  }
  return vector;
}

export function similitud(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let aMag = 0;
  let bMag = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aMag += a[i] * a[i];
    bMag += b[i] * b[i];
  }
  if (aMag === 0 || bMag === 0) return 0;
  return dot / (Math.sqrt(aMag) * Math.sqrt(bMag));
}

export function vecinos(
  libreta: EjemploLibreta[],
  estado: string,
  k: number,
  ambito: string
): EjemploLibreta[] {
  const estadoHuella = huellaPalabras(estado);
  return libreta
    .filter((e) => e.ambito === ambito && e.desenlaceOk !== null)
    .map((e) => ({
      e,
      score: similitud(estadoHuella, huellaPalabras(e.punto)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((item) => item.e);
}

export function votar(vecinosList: EjemploLibreta[]): { respuesta: string; apoyo: number } | null {
  if (vecinosList.length < 5) return null;

  const votos: Record<string, number> = {};
  for (const v of vecinosList) {
    votos[v.respuesta] = (votos[v.respuesta] || 0) + 1;
  }

  let mejorRespuesta = "";
  let maxVotos = 0;
  for (const r in votos) {
    if (votos[r] > maxVotos) {
      maxVotos = votos[r];
      mejorRespuesta = r;
    }
  }

  const apoyo = maxVotos / vecinosList.length;
  if (apoyo < 0.6) return null;

  return { respuesta: mejorRespuesta, apoyo };
}
