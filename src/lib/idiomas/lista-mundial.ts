import { CODIGOS_ISO, MAS_HABLADOS, ALIAS, esRtl } from "./tabla-iso";
import { IDIOMAS, CON_CATALOGO } from "./idiomas";

export interface IdiomaMundial {
  codigo: string;
  nombrePropio: string;
  nombreActual: string;
  masHablado: boolean;
  dir: "ltr" | "rtl";
  conCatalogo: boolean;
  alias: string[];
}

export type DisplayNamesLike = { of(code: string): string | undefined };
export type CollatorLike = { compare(a: string, b: string): number };

export interface EntornoListaMundial {
  idiomaActual: string;
  displayNames?: DisplayNamesLike;
  collator?: CollatorLike;
}

const esNombreInvalido = (nombre: string, codigo: string): boolean =>
  !nombre || nombre.toLowerCase() === codigo.toLowerCase();

export function listaMundial(entorno: EntornoListaMundial = { idiomaActual: "es" }): IdiomaMundial[] {
  const idiomaActual = entorno.idiomaActual;
  const getNombre = (codigo: string, locale: string): string | undefined => {
    try {
      const dn = entorno.displayNames ?? new Intl.DisplayNames([locale], { type: "language" });
      const res = dn.of(codigo);
      return esNombreInvalido(res, codigo) ? undefined : res;
    } catch {
      return undefined;
    }
  };

  const mapaManual = new Map(IDIOMAS.map((i) => [i.codigo, i]));
  const todosCodigos = new Set([...CODIGOS_ISO, ...IDIOMAS.map((i) => i.codigo)]);
  const resultado: IdiomaMundial[] = [];

  for (const codigo of todosCodigos) {
    const manual = mapaManual.get(codigo);
    let nombrePropio = getNombre(codigo, codigo) ?? manual?.nombre;
    let nombreActual = getNombre(codigo, idiomaActual) ?? nombrePropio;

    if (!nombrePropio && !nombreActual && !manual) continue;
    if (!nombrePropio) nombrePropio = codigo;
    if (!nombreActual) nombreActual = nombrePropio;

    const masHablado = MAS_HABLADOS.includes(codigo) || (codigo === "zh-hant" && MAS_HABLADOS.includes("zh"));
    const dir = manual?.dir ?? (esRtl(codigo) ? "rtl" : "ltr");
    const alias: string[] = [];
    for (const [al, cods] of Object.entries(ALIAS)) {
      if (cods.includes(codigo) && !alias.includes(al)) alias.push(al);
    }

    resultado.push({ codigo, nombrePropio, nombreActual, masHablado, dir, conCatalogo: CON_CATALOGO.includes(codigo), alias });
  }

  const collator = entorno.collator ?? new Intl.Collator(idiomaActual, { sensitivity: "base" });
  resultado.sort((a, b) => collator.compare(a.nombreActual, b.nombreActual));
  return resultado;
}

export function agrupar(lista: IdiomaMundial[]): { masHablados: IdiomaMundial[]; todos: IdiomaMundial[] } {
  return { masHablados: lista.filter((i) => i.masHablado), todos: lista };
}