import { IdiomaMundial } from "./lista-mundial";

export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
}

function distanciaEdicion(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function coincideConErrata(campo: string, consulta: string): boolean {
  if (consulta.length < 4) return false;
  const palabras = campo.split(" ");
  for (const palabra of palabras) {
    if (distanciaEdicion(palabra, consulta) <= 1) return true;
  }
  return false;
}

type TipoCoincidencia = "exacto" | "prefijo" | "contiene" | "errata";

interface ResultadoBusqueda {
  idioma: IdiomaMundial;
  tipo: TipoCoincidencia;
  prioridad: number;
}

function obtenerPrioridad(tipo: TipoCoincidencia): number {
  switch (tipo) {
    case "exacto":
      return 0;
    case "prefijo":
      return 1;
    case "contiene":
      return 2;
    case "errata":
      return 3;
  }
}

function buscarEnCampos(idioma: IdiomaMundial, consultaNorm: string): TipoCoincidencia | null {
  const campos = [
    idioma.codigo,
    idioma.nombrePropio,
    idioma.nombreActual,
    ...idioma.alias,
  ].map(normalizarTexto);

  for (const campo of campos) {
    if (campo === consultaNorm) return "exacto";
    if (campo.startsWith(consultaNorm)) return "prefijo";
    if (campo.includes(consultaNorm)) return "contiene";
    if (coincideConErrata(campo, consultaNorm)) return "errata";
  }
  return null;
}

export function buscarIdiomas(lista: IdiomaMundial[], consulta: string): IdiomaMundial[] {
  if (!consulta || consulta.trim() === "") {
    return [...lista];
  }

  const consultaNorm = normalizarTexto(consulta);
  const resultados: ResultadoBusqueda[] = [];

  for (const idioma of lista) {
    const tipo = buscarEnCampos(idioma, consultaNorm);
    if (tipo) {
      resultados.push({
        idioma,
        tipo,
        prioridad: obtenerPrioridad(tipo),
      });
    }
  }

  resultados.sort((a, b) => {
    if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
    return a.idioma.nombreActual.localeCompare(b.idioma.nombreActual, "es", { sensitivity: "base" });
  });

  return resultados.map((r) => r.idioma);
}