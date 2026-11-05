// Recuerdos de las cápsulas Memvid y LEANN en Astraura (MVD1027F, LNN1028F) —
// módulo PURO: sin red, sin disco, sin procesos. Solo búsqueda, fusión por rango
// recíproco, filtrado por alcance y detección de fuga. La E/S real (Memvid y LEANN)
// se inyecta como dependencia para que sea testeable y para que ningún `node:*`
// acabe en el navegador (CLAUDE.md, trampa 11).
import {
  capsulasParaContexto,
  alcanceDe,
  saneaId,
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
  /** Memvid: en vivo /api/memorias/capsulas; en pruebas, un fake. */
  buscar?: BuscarCapsulaFn;
  /** LEANN por significado; sin ella, «recordar» sigue solo con Memvid. */
  buscarLeann?: BuscarLeannFn;
  /** Si el modelo elegido es de la nube → ejecuta detectarFuga contra lo personal. */
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

function memoriaScopeActivaCapsulas(scope?: string): boolean {
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
  return {
    uri,
    texto: acierto.texto,
    ts: typeof meta?.ts === "number" ? meta.ts * 1000 : undefined,
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
  const lineas = recuerdos.map((r) => `- ${r.texto}`).join("\n");
  return `RECUERDOS (${etiqueta}):\n${lineas}`;
}

/** `recordar(contexto, consulta)` o `recordar({ contexto, consulta, … })`. */
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
  const { contexto, buscar, buscarLeann, esModeloNube = false, timeoutMs = 900, memoryScope } = opts;

  if (!memoriaScopeActivaCapsulas(memoryScope)) return "";
  // El juicio barato solo aplica a la ruta fusionada: Memvid clásico no cambia.
  if (buscarLeann && !consultaPideBuscar(opts.consulta)) return "";

  const actor = contexto.actor;
  const permitidos = alcanceVisiblePara(actor);
  if (permitidos.length === 0) return "";

  const capsulas = capsulasParaContexto(contexto, actor);
  if (capsulas.length === 0) return "";

  const inicio = Date.now();
  try {
    const listas = await Promise.all(capsulas.map(async (capsula) => {
      const restante = timeoutMs - (Date.now() - inicio);
      const sujeto = capsula.sujeto;
      const [memvid, leann] = await Promise.all([
        buscar && restante > 0
          ? enTiempo(buscar(sujeto, opts.consulta, K_POR_CAPSULA), restante)
          : Promise.resolve(null),
        buscarLeann && restante > 0
          ? enTiempo(buscarLeann(nombreIndiceLeann(sujeto), opts.consulta, {
              k: K_POR_CAPSULA,
              filtros: { alcance: { in: permitidos } },
              pesoVector: pesoVectorPara(opts.consulta),
            }), restante)
          : Promise.resolve(null),
      ]);

      const vistosMemvid = new Set<string>();
      const vistosLeann = new Set<string>();
      return {
        memvid: (memvid ?? []).map((a, i) =>
          aRecuerdoMemvid(a, uriUnica(a.uri, i, vistosMemvid))),
        leann: (leann ?? []).map((a, i) =>
          aRecuerdoLeann(a, alcanceDe(sujeto), uriUnica(
            typeof a.metadatos?.uri === "string" ? a.metadatos.uri : a.id,
            i,
            vistosLeann,
          ))),
      };
    }));

    const fusion = fundirRecuerdos(
      [listas.flatMap((l) => l.memvid), listas.flatMap((l) => l.leann)],
      { max: MAX_FRAGMENTOS, maxCaracteres: MAX_CARACTERES },
    );
    const porId = new Map<string, Recuerdo>(
      fusion.map((r, i) => [`r${i}`, r]),
    );
    const visibles = filtrarParaAlcance(
      fusion.map((r, i) => aFragmento(r, `r${i}`)),
      permitidos,
    ).flatMap((f) => {
      const recuerdo = porId.get(f.id);
      return recuerdo ? [recuerdo] : [];
    });

    let bloque = aBloque(visibles);
    if (esModeloNube && bloque.length > 0) {
      const personales = visibles
        .filter((r) => r.alcance === "personal")
        .map((r, i) => aFragmento(r, `p${i}`));
      if (personales.length > 0 && detectarFuga(bloque, personales).length > 0) {
        bloque = "[FUGA DETECTADA] " + bloque;
      }
    }
    return bloque;
  } catch {
    return "";
  }
}

/** Nombre anterior de `recordar` (MVD1027F): mismo contrato, ahora sinónimo. */
export const recordarDeCapsulas = recordar;

// Se conserva el re-export histórico para quien lo importaba de aquí.
export { alcanceVisiblePara };
