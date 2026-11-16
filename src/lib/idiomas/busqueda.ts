import type { IdiomaMundial } from "./lista-mundial";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function distanciaLevenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function buscarIdiomas(lista: IdiomaMundial[], consulta: string): IdiomaMundial[] {
  const q = normalizar(consulta);
  if (!q) return [...lista];

  const resultados: { item: IdiomaMundial; rank: number }[] = [];

  for (const item of lista) {
    const codigo = normalizar(item.codigo);
    const nombrePropio = normalizar(item.nombrePropio);
    const nombreActual = normalizar(item.nombreActual);
    const aliasNorm = item.alias.map(normalizar);

    let rank = Infinity;
    let coincide = false;

    if (codigo === q) {
      rank = 0;
      coincide = true;
    } else if (codigo.startsWith(q)) {
      rank = Math.min(rank, 1);
      coincide = true;
    }

    const prefijoNombre = nombrePropio.startsWith(q) || nombreActual.startsWith(q) || aliasNorm.some(a => a.startsWith(q));
    if (prefijoNombre) {
      rank = Math.min(rank, 2);
      coincide = true;
    }

    const contieneNombre = nombrePropio.includes(q) || nombreActual.includes(q) || aliasNorm.some(a => a.includes(q));
    if (contieneNombre) {
      rank = Math.min(rank, 3);
      coincide = true;
    }

    if (q.length >= 4) {
      const candidatos = [nombrePropio, nombreActual, ...aliasNorm];
      for (const c of candidatos) {
        if (distanciaLevenshtein(q, c) <= 1) {
          rank = Math.min(rank, 4);
          coincide = true;
          break;
        }
      }
    }

    if (coincide) resultados.push({ item, rank });
  }

  resultados.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const na = normalizar(a.item.nombreActual);
    const nb = normalizar(b.item.nombreActual);
    return na.localeCompare(nb);
  });

  return resultados.map(r => r.item);
}
