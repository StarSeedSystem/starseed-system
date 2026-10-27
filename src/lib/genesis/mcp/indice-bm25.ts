/**
 * Índice BM25 clásico para el descubrimiento progresivo de herramientas MCP.
 * Puro: sin red, sin disco y sin reloj.
 */
const PALABRAS_VACIAS = new Set([
  "de", "la", "el", "los", "las", "un", "una", "y", "en",
  "the", "a", "of", "to", "for", "and",
]);

export function tokenizar(texto: string): string[] {
  const separado = texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
  return separado
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !PALABRAS_VACIAS.has(token));
}

export interface DocumentoBm25 {
  id: string;
  texto: string;
}

export function crearIndiceBm25(docs: ReadonlyArray<DocumentoBm25>) {
  const k1 = 1.5;
  const b = 0.75;
  const tokens = docs.map((doc) => tokenizar(doc.texto));
  const longitudes = tokens.map((lista) => lista.length);
  const media = longitudes.length
    ? longitudes.reduce((total, largo) => total + largo, 0) / longitudes.length
    : 0;
  const frecuencias = tokens.map((lista) => {
    const mapa = new Map<string, number>();
    for (const token of lista) mapa.set(token, (mapa.get(token) ?? 0) + 1);
    return mapa;
  });
  const documentosConTermino = new Map<string, number>();
  for (const mapa of frecuencias) {
    for (const termino of mapa.keys()) {
      documentosConTermino.set(termino, (documentosConTermino.get(termino) ?? 0) + 1);
    }
  }
  const total = docs.length;

  return {
    buscar(consulta: string, limite: number): { id: string; puntuacion: number }[] {
      const terminos = Array.from(new Set(tokenizar(consulta)));
      if (terminos.length === 0 || limite <= 0) return [];
      const resultados = docs.map((doc, indice) => {
        let puntuacion = 0;
        const largo = longitudes[indice];
        for (const termino of terminos) {
          const tf = frecuencias[indice].get(termino) ?? 0;
          const n = documentosConTermino.get(termino) ?? 0;
          if (tf === 0 || n === 0) continue;
          const idf = Math.log(1 + (total - n + 0.5) / (n + 0.5));
          const normalizacion = 1 - b + b * (largo / (media || 1));
          puntuacion += (idf * tf * (k1 + 1)) / (tf + k1 * normalizacion);
        }
        return { id: doc.id, puntuacion };
      });
      return resultados
        .filter((resultado) => resultado.puntuacion > 0)
        .sort(
          (a, z) =>
            z.puntuacion - a.puntuacion ||
            (a.id < z.id ? -1 : a.id > z.id ? 1 : 0),
        )
        .slice(0, limite);
    },
  };
}
