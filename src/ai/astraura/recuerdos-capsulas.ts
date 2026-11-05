// Recuerdos de las cápsulas Memvid y LEANN en Astraura (MVD1027F, LNN1028F) —
// módulo PURO: sin red, sin disco, sin procesos. Solo búsqueda, fusión por rango
// recíproco, filtrado por alcance y detección de fuga, según los contratos
// architecture/memvid-capsulas.md §3 y architecture/leann-recuerdo-semantico.md §4.
// La E/S real (Memvid y LEANN) se inyecta como dependencia: en las pruebas ni una llamada.
import {
  capsulasParaContexto,
  alcanceDe,
  saneaId,
  type CapsulaMemoria,
  type ContextoCapsulas,
  type SujetoMemoria,
} from "@/lib/memorias/capsulas";
import {
  filtrarParaAlcance,
  detectarFuga,
  alcanceVisiblePara,
  ORDEN_ALCANCE,
  type FragmentoMemoria,
  type ActorMemoria,
  type AlcanceMemoria,
} from "@/lib/nucleo/alcance-memoria";
import {
  fundirRecuerdos,
  pesoVectorPara,
  type Recuerdo,
} from "@/lib/memorias/fusion-recuerdos";

export interface AciertoCapsula {
  titulo: string;
  texto: string;
  uri?: string;
  ts?: number;
  alcance: AlcanceMemoria;
  sujeto: SujetoMemoria;
}

export type BuscarCapsulaFn = (
  sujeto: SujetoMemoria,
  consulta: string,
  k: number,
) => Promise<AciertoCapsula[] | null>;

/** Acierto de LEANN con lo único que usa este módulo. */
export interface AciertoLeannSuelto {
  id?: string;
  texto: string;
  puntuacion?: number;
  metadatos?: Record<string, string | number>;
}

export type BuscarLeannFn = (
  indice: string,
  consulta: string,
  opciones?: { k?: number; filtros?: Record<string, unknown>; pesoVector?: number },
) => Promise<AciertoLeannSuelto[] | null>;

export interface RecordarOpciones {
  /** Consulta del usuario. */
  consulta: string;
  /** Contexto del chat: qué cápsulas buscar y quién pregunta. */
  contexto: ContextoCapsulas & { actor: ActorMemoria };
  /** Memvid: en vivo el cliente de cápsulas del servidor; en tests, el falso. */
  buscar?: BuscarCapsulaFn;
  /** LEANN por significado; sin esta función, «recordar» sigue solo con Memvid. */
  buscarLeann?: BuscarLeannFn;
  /** Si el modelo elegido es de la nube: no viaja lo personal y pasa detectarFuga. */
  esModeloNube?: boolean;
  /** Tope total en ms (por defecto 900). */
  timeoutMs?: number;
  /** memoryScope del chat: "personal" desactiva las cápsulas. */
  memoryScope?: string;
}

/** Máximo de fragmentos totales que se devuelven. */
const MAX_FRAGMENTOS = 6;
/** Máximo de caracteres totales en el bloque de recuerdos. */
const MAX_CARACTERES = 1500;
/** k por cápsula. */
const K_POR_CAPSULA = 4;
/** Tope total de la operación (contrato §3): si se pasa, sale con lo que haya o «». */
const TOPE_TOTAL_MS = 800;

function memoryScopeActivaCapsulas(scope?: string): boolean {
  return scope !== "personal";
}

/** «Menos de 4 palabras y sin pregunta»: no merece gastar una búsqueda. */
function consultaPideBuscar(consulta: string): boolean {
  return /[?¿]/.test(consulta) || consulta.trim().split(/\s+/).filter(Boolean).length >= 4;
}

/** Nombre del índice LEANN del sujeto (mismo formato que `leann-cliente`). */
function nombreIndiceLeann(sujeto: SujetoMemoria): string {
  return `${sujeto.tipo}-${saneaId(sujeto.id)}-${alcanceDe(sujeto)}`;
}

function esAlcance(valor: unknown): valor is AlcanceMemoria {
  return typeof valor === "string" && (ORDEN_ALCANCE as string[]).includes(valor);
}

/** Uri único dentro de una lista: conserva el real y desambigua los repetidos. */
function uriUnica(base: string | undefined, indice: number, vistos: Set<string>): string {
  if (!base) return "";
  if (!vistos.has(base)) {
    vistos.add(base);
    return base;
  }
  const unico = `${base}#${indice}`;
  vistos.add(unico);
  return unico;
}

function aRecuerdoMemvid(acierto: AciertoCapsula, uri: string): Recuerdo {
  return {
    uri,
    texto: acierto.texto,
    titulo: acierto.titulo,
    ts: acierto.ts,
    fuente: "memvid",
    alcance: acierto.alcance,
  };
}

function aRecuerdoLeann(
  acierto: AciertoLeannSuelto,
  alcance: AlcanceMemoria,
  uri: string,
): Recuerdo {
  const meta = acierto.metadatos;
  const ts = typeof meta?.ts === "number"
    ? (meta.ts < 1e12 ? meta.ts * 1000 : meta.ts)
    : undefined;
  return {
    uri,
    texto: acierto.texto,
    ts,
    fuente: "leann",
    puntuacion: acierto.puntuacion,
    alcance: esAlcance(meta?.alcance) ? meta.alcance : alcance,
  };
}

/** Espera como mucho `ms`; lo que llegue tarde (o falle) no entra: vale null. */
function enTiempo<T>(promesa: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => resolver(null), Math.max(0, ms));
    promesa.then(
      (valor) => { clearTimeout(temporizador); resolver(valor); },
      () => { clearTimeout(temporizador); resolver(null); },
    );
  });
}

function aFragmento(recuerdo: Recuerdo, id: string): FragmentoMemoria {
  return {
    id,
    alcance: recuerdo.alcance,
    texto: recuerdo.texto,
    origen: recuerdo.titulo ?? (recuerdo.fuente === "leann" ? "LEANN" : "Memvid"),
    at: recuerdo.ts ?? 0,
  };
}

/** Bloque «RECUERDOS»: la etiqueta dice de dónde salió lo que de verdad entró. */
function aBloque(recuerdos: Recuerdo[]): string {
  if (recuerdos.length === 0) return "";
  const fuentes = new Set(recuerdos.flatMap((r) => r.fuentes ?? [r.fuente]));
  const etiqueta = fuentes.size > 1
    ? "memoria + significado"
    : fuentes.has("leann") ? "significado LEANN" : "cápsulas Memvid";
  return [`RECUERDOS (${etiqueta}):`, ...recuerdos.map((r) => `- ${r.texto}`)].join("\n");
}

function aFragmentoMemoria(acierto: AciertoCapsula): FragmentoMemoria {
  return {
    id: acierto.uri ?? `cápsula:${acierto.sujeto.tipo}:${acierto.sujeto.id}`,
    alcance: acierto.alcance,
    texto: acierto.texto.trim(),
    origen: acierto.titulo ?? acierto.sujeto.tipo,
    at: acierto.ts ?? Date.now(),
  };
}

/** `recordar(contexto, consulta, opciones?)` o `recordar({ contexto, consulta, … })`. */
export function recordar(
  contexto: ContextoCapsulas & { actor: ActorMemoria },
  consulta: string,
  opciones?: Omit<RecordarOpciones, "consulta" | "contexto">,
): Promise<string>;
export function recordar(opts: RecordarOpciones): Promise<string>;
export async function recordar(
  primero: RecordarOpciones | (ContextoCapsulas & { actor: ActorMemoria }),
  consulta?: string,
  opciones?: Omit<RecordarOpciones, "consulta" | "contexto">,
): Promise<string> {
  const opts: RecordarOpciones = typeof consulta === "string"
    ? { ...opciones, contexto: primero as ContextoCapsulas & { actor: ActorMemoria }, consulta }
    : (primero as RecordarOpciones);
  const {
    contexto,
    buscar,
    buscarLeann,
    esModeloNube = false,
    timeoutMs = TOPE_TOTAL_MS,
    memoryScope,
  } = opts;

  if (!memoryScopeActivaCapsulas(memoryScope)) return "";

  const textoConsulta = opts.consulta.trim();
  if (!textoConsulta) return "";

  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) return "";

  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";

  // El juicio barato solo aplica a la ruta fusionada: Memvid clásico no cambia.
  if (buscarLeann && !consultaPideBuscar(textoConsulta)) return "";

  // Tope total como carrera: aunque el buscador se cuelgue y no escuche
  // señales, sale a tiempo con «» — la memoria nunca tumba la conversación.
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  try {
    const trabajo = buscarLeann
      ? componeFundidos(
          textoConsulta, capsulas, permitidos, buscar, buscarLeann, esModeloNube, timeoutMs,
        )
      : componeRecuerdos(textoConsulta, capsulas, permitidos, buscar, esModeloNube);
    const fueraDePlazo = new Promise<string>((resuelto) => {
      temporizador = setTimeout(() => resuelto(""), timeoutMs);
    });
    return await Promise.race([trabajo, fueraDePlazo]);
  } catch {
    return "";
  } finally {
    clearTimeout(temporizador);
  }
}

/** Nombre anterior de `recordar` (MVD1027F): mismo contrato, ahora sinónimo. */
export const recordarDeCapsulas = recordar;

/** Recorre las cápsulas, busca y compone el bloque. Un fallo interno sale como «». */
async function componeRecuerdos(
  consulta: string,
  capsulas: CapsulaMemoria[],
  permitidos: AlcanceMemoria[],
  buscar: BuscarCapsulaFn | undefined,
  esModeloNube: boolean,
): Promise<string> {
  if (!buscar) return "";
  try {
    const todos: FragmentoMemoria[] = [];
    let caracteresTotales = 0;

    for (const capsula of capsulas) {
      if (todos.length >= MAX_FRAGMENTOS) break;
      if (caracteresTotales >= MAX_CARACTERES) break;

      const aciertos = await buscar(capsula.sujeto, consulta, K_POR_CAPSULA);
      if (!aciertos || aciertos.length === 0) continue;

      const filtrados = filtrarParaAlcance(
        aciertos.map(aFragmentoMemoria), permitidos,
      );
      for (const fr of filtrados) {
        if (todos.length >= MAX_FRAGMENTOS) break;
        const queda = MAX_CARACTERES - caracteresTotales;
        if (queda <= 0) break;
        // Al llenar el cupo de caracteres se recorta el último, no se tira.
        const recortado = fr.texto.length > queda ? fr.texto.slice(0, queda) : fr.texto;
        if (!recortado) continue;
        todos.push({ ...fr, texto: recortado });
        caracteresTotales += recortado.length;
      }
    }

    let visibles = todos;
    if (esModeloNube) {
      // Antes de salir hacia un modelo de la nube: no viaja lo personal y, como
      // valla final del contrato, detectarFuga contra lo personal de otra vía.
      const personales = visibles.filter((fr) => fr.alcance === "personal");
      visibles = visibles.filter((fr) => fr.alcance !== "personal");
      const fuga = detectarFuga(
        visibles.map((fr) => fr.texto).join("\n"), personales,
      );
      if (fuga.length > 0) return "";
    }

    if (visibles.length === 0) return "";
    return ["RECUERDOS (cápsulas Memvid):", ...visibles.map((fr) => `- ${fr.texto}`)].join("\n");
  } catch {
    return "";
  }
}

/** Ruta fusionada: por cada cápsula, Memvid y LEANN a la vez; luego RRF. */
async function componeFundidos(
  consulta: string,
  capsulas: CapsulaMemoria[],
  permitidos: AlcanceMemoria[],
  buscar: BuscarCapsulaFn | undefined,
  buscarLeann: BuscarLeannFn,
  esModeloNube: boolean,
  timeoutMs: number,
): Promise<string> {
  try {
    const inicio = Date.now();
    const memvid: Recuerdo[] = [];
    const leann: Recuerdo[] = [];
    for (const capsula of capsulas) {
      const restante = timeoutMs - (Date.now() - inicio);
      if (restante <= 0) break;
      const sujeto = capsula.sujeto;
      const [halladosMemvid, halladosLeann] = await Promise.all([
        buscar
          ? enTiempo(buscar(sujeto, consulta, K_POR_CAPSULA), restante)
          : Promise.resolve(null),
        enTiempo(buscarLeann(nombreIndiceLeann(sujeto), consulta, {
          k: K_POR_CAPSULA,
          filtros: { alcance: { in: permitidos } },
          pesoVector: pesoVectorPara(consulta),
        }), restante),
      ]);

      const vistosMemvid = new Set<string>();
      const vistosLeann = new Set<string>();
      for (const [i, a] of (halladosMemvid ?? []).entries()) {
        memvid.push(aRecuerdoMemvid(a, uriUnica(a.uri, i, vistosMemvid)));
      }
      for (const [i, a] of (halladosLeann ?? []).entries()) {
        const base = typeof a.metadatos?.uri === "string" ? a.metadatos.uri : a.id;
        leann.push(aRecuerdoLeann(a, alcanceDe(sujeto), uriUnica(base, i, vistosLeann)));
      }
    }

    const fusion = fundirRecuerdos([memvid, leann], {
      max: MAX_FRAGMENTOS, maxCaracteres: MAX_CARACTERES,
    });
    const porId = new Map<string, Recuerdo>();
    const fragmentos = fusion.map((r, i) => {
      const id = `r${i}`;
      porId.set(id, r);
      return aFragmento(r, id);
    });
    let visibles = filtrarParaAlcance(fragmentos, permitidos).flatMap((fr) => {
      const recuerdo = porId.get(fr.id);
      return recuerdo ? [{ ...recuerdo, texto: fr.texto }] : [];
    });

    let personales: FragmentoMemoria[] = [];
    if (esModeloNube) {
      // Lo personal no viaja a la nube; detectarFuga es la valla final.
      personales = visibles
        .filter((r) => r.alcance === "personal")
        .map((r, i) => aFragmento(r, `p${i}`));
      visibles = visibles.filter((r) => r.alcance !== "personal");
    }

    const bloque = aBloque(visibles);
    if (esModeloNube && bloque.length > 0 && personales.length > 0
      && detectarFuga(bloque, personales).length > 0) return "";
    return bloque;
  } catch {
    return "";
  }
}

