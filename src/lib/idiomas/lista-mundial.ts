import { IDIOMAS, idiomasConCatalogo, Idioma } from "./idiomas";
import { CODIGOS_ISO, MAS_HABLADOS, esRtl, ALIAS } from "./tabla-iso";

export interface IdiomaMundial {
  codigo: string;
  nombrePropio: string;
  nombreActual: string;
  masHablado: boolean;
  dir: "ltr" | "rtl";
  conCatalogo: boolean;
  alias: string[];
}

export interface EntornoListaMundial {
  idiomaActual: string;
  displayNames?: typeof Intl.DisplayNames;
  collator?: typeof Intl.Collator;
}

export function listaMundial(entorno: EntornoListaMundial): IdiomaMundial[] {
  const { idiomaActual, displayNames = Intl.DisplayNames, collator = Intl.Collator } = entorno;
  
  const DNPropio = displayNames;
  const DNCodigo = displayNames;

  const resultado: IdiomaMundial[] = [];
  const procesados = new Set<string>();

  const codigosUnicos = Array.from(new Set([...CODIGOS_ISO, ...IDIOMAS.map((i) => i.codigo)]));

  for (const codigo of codigosUnicos) {
    if (procesados.has(codigo)) continue;
    procesados.add(codigo);

    let nombrePropio = "";
    let nombreActual = "";

    try {
      const dnPropioInst = new DNPropio([codigo], { type: "language" });
      const dnActualInst = new DNCodigo([idiomaActual], { type: "language" });

      const nP = dnPropioInst.of(codigo);
      const nA = dnActualInst.of(codigo);

      if (!nP || !nA || nP === codigo || nA === codigo) {
        const idManual = IDIOMAS.find((i) => i.codigo === codigo);
        if (idManual) {
          nombrePropio = idManual.nombre;
          nombreActual = idManual.nombre;
        } else {
          continue;
        }
      } else {
        nombrePropio = nP;
        nombreActual = nA;
      }
    } catch {
      const idManual = IDIOMAS.find((i) => i.codigo === codigo);
      if (idManual) {
        nombrePropio = idManual.nombre;
        nombreActual = idManual.nombre;
      } else {
        continue;
      }
    }

    const idManual = IDIOMAS.find((i) => i.codigo === codigo);
    const dir = idManual ? idManual.dir : esRtl(codigo) ? "rtl" : "ltr";
    const masHablado = MAS_HABLADOS.includes(codigo);
    const conCatalogo = idiomasConCatalogo().includes(codigo);

    const alias: string[] = [];
    for (const [aliasNombre, cods] of Object.entries(ALIAS)) {
      if (cods.includes(codigo)) {
        alias.push(aliasNombre);
      }
    }

    resultado.push({
      codigo,
      nombrePropio,
      nombreActual,
      masHablado,
      dir,
      conCatalogo,
      alias,
    });
  }

  const col = new collator(idiomaActual, { sensitivity: "base" });
  resultado.sort((a, b) => col.compare(a.nombreActual, b.nombreActual));

  return resultado;
}

export function agrupar(lista: IdiomaMundial[]): { masHablados: IdiomaMundial[]; todos: IdiomaMundial[] } {
  return {
    masHablados: lista.filter((i) => i.masHablado),
    todos: lista,
  };
}
