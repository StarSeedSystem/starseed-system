/**
 * StarSeed OS — Corrector por glosario de nombres propios para el oído STT.
 * Funciones PURAS (sin red, sin disco, sin DOM, sin fetch).
 */
export interface CambioGlosario { original: string; corregido: string; posicion?: number; }
export interface ResultadoGlosario { texto: string; cambios: CambioGlosario[]; }

const COMUNES_ES = new Set(["a","al","de","del","el","en","es","la","las","lo","los","me","mi","no","o","para","por","que","se","te","un","una","y","ya","yo","star","sed","said"]);
const COMUNES_EN = new Set(["a","an","and","are","as","at","be","by","for","from","i","in","is","it","of","on","or","to","the","with","star","sed","said"]);

function esComun(p: string, id: string): boolean { return (id === "en" ? COMUNES_EN : COMUNES_ES).has(p.toLowerCase()); }
function norm(s: string): string { return s.toLowerCase().replace(/\s+/g, "").trim(); }
function lev(a: string, b: string): number {
  const [m, n] = [a.length, b.length];
  const d: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
function distNorm(original: string, candidato: string): number { const mx = Math.max(original.length, candidato.length); return mx === 0 ? 0 : lev(original, candidato) / mx; }

export function glosarioBase(): string[] {
  return ["Astraura", "StarSeed", "Genesis", "MetaGenesis", "PoliGenesis", "ProtoGenesis", "Aurora", "Hermes"];
}

export function corregirConGlosario(texto: string, glosario: string[], idioma: string = "es"): ResultadoGlosario {
  const cambios: CambioGlosario[] = [];
  const palabras = texto.split(/\s+/).filter((w) => w.length > 0);
  const reemplazos: { inicio: number; fin: number; corregido: string; original: string }[] = [];
  for (let i = 0; i < palabras.length; i++) {
    for (let len = 1; len <= 2 && i + len <= palabras.length; len++) {
      const secuencia = palabras.slice(i, i + len).join(" ");
      const normalizada = norm(secuencia);
      if (esComun(normalizada, idioma)) continue;
      for (const termino of glosario) {
        const tn = norm(termino);
        if (normalizada === tn) { reemplazos.push({ inicio: i, fin: i + len, corregido: termino, original: secuencia }); break; }
        if (distNorm(normalizada, tn) <= 0.5) { reemplazos.push({ inicio: i, fin: i + len, corregido: termino, original: secuencia }); break; }
      }
    }
  }
  const ordenados = reemplazos.sort((a, b) => (a.inicio === b.inicio ? (b.fin - b.inicio) - (a.fin - a.inicio) : a.inicio - b.inicio));
  const aceptados: typeof ordenados = [];
  for (const r of ordenados) { if (!aceptados.some((a) => r.inicio < a.fin && r.fin > a.inicio)) aceptados.push(r); }
  const aceptadosOrdenados = aceptados.sort((a, b) => a.inicio - b.inicio);
  const nuevasPalabras: string[] = [];
  let idx = 0;
  for (const r of aceptadosOrdenados) {
    while (idx < r.inicio) { nuevasPalabras.push(palabras[idx]); idx++; }
    nuevasPalabras.push(r.corregido);
    idx = r.fin;
  }
  while (idx < palabras.length) { nuevasPalabras.push(palabras[idx]); idx++; }
  return { texto: nuevasPalabras.join(" "), cambios: aceptadosOrdenados.map((r) => ({ original: r.original, corregido: r.corregido })) };
}
