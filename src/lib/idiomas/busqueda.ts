export interface IdiomaMundial {
  codigo: string;
  nombreActual: string;
  nombrePropio: string;
  alias: string[];
}

export function buscarIdiomas(lista: IdiomaMundial[], consulta: string): IdiomaMundial[] {
  const c = consulta.trim();
  if (!c) return [...lista];

  const normalizar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const cNorm = normalizar(c);

  const getDistancia = (a: string, b: string) => {
    const track = Array(b.length + 1)
      .fill(null)
      .map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= b.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= b.length; j += 1) {
      for (let i = 1; i <= a.length; i += 1) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        track[j][i] = Math.min(
          track[j][i - 1] + 1,
          track[j - 1][i] + 1,
          track[j - 1][i - 1] + indicator
        );
      }
    }
    return track[b.length][a.length];
  };

  return lista
    .map((idioma) => {
      const campos = [
        idioma.nombrePropio,
        idioma.nombreActual,
        idioma.codigo,
        ...idioma.alias,
      ].map(normalizar);

      let puntuacion = -1;

      // Código exacto
      if (idioma.codigo.toLowerCase() === c.toLowerCase()) puntuacion = 4;
      // Prefijo de nombre
      else if (
        campos[0].startsWith(cNorm) ||
        campos[1].startsWith(cNorm) ||
        idioma.codigo.toLowerCase().startsWith(c.toLowerCase())
      )
        puntuacion = 3;
      // Contiene
      else if (campos.some((campo) => campo.includes(cNorm))) puntuacion = 2;
      // Errata
      else if (
        c.length >= 4 &&
        campos.some((campo) => getDistancia(campo, cNorm) <= 1)
      )
        puntuacion = 1;

      return { idioma, puntuacion };
    })
    .filter((item) => item.puntuacion !== -1)
    .sort((a, b) => {
      if (b.puntuacion !== a.puntuacion) return b.puntuacion - a.puntuacion;
      return a.idioma.nombreActual.localeCompare(b.idioma.nombreActual);
    })
    .map((item) => item.idioma);
}
